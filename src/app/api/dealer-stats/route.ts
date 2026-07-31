import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

// Phase 4 D2: Dealer Workflow stats. Mirrors /api/agent-stats but groups by dealerId.
// Counts UNIQUE orders by their CURRENT status (never status-change events).
// "Untouched" = still waiting at the dealer (GPO / GPO Pending); "Worked" = moved beyond.
const DBUCKETS: Record<string, string[]> = {
  "GPO Pending": ["GPO", "GPO Pending"],
  "GPO Done": ["GPO Done"],
  Delivered: ["Delivered", "GPO Delivered"],
  Cancelled: ["Dealer Cancel", "Cancelled", "RTO", "Confirm cancel", "Cancel pending", "Final cancel"],
};
const S2B: Record<string, string> = {};
for (const [b, arr] of Object.entries(DBUCKETS)) for (const s of arr) S2B[s] = b;
const UNTOUCHED = new Set(["GPO", "GPO Pending"]);

type DealerRow = { dealerId: number; name: string; assigned: number; worked: number; untouched: number; ["GPO Pending"]: number; ["GPO Done"]: number; Delivered: number; Cancelled: number; Other: number };
function blank(dealerId: number, name: string): DealerRow {
  return { dealerId, name, assigned: 0, worked: 0, untouched: 0, "GPO Pending": 0, "GPO Done": 0, Delivered: 0, Cancelled: 0, Other: 0 };
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const viewAll = can(user, "orders.viewAll");
  const sp = req.nextUrl.searchParams;

  const baseWhere: any = { isDeleted: false, dealerId: { not: null }, source: { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] } };
  if (!viewAll) {
    if (user.role === "DEALER" && user.dealerId) baseWhere.dealerId = user.dealerId;
    else return ok({ scope: "own", dealers: [], totals: blank(0, "TOTAL") });
  }
  const from = sp.get("assignFrom"), to = sp.get("assignTo");
  if (from || to) baseWhere.dealerAssignDate = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) };

  const grouped = await prisma.order.groupBy({ by: ["dealerId", "orderStatus"], where: baseWhere, _count: { _all: true } });

  const ids = Array.from(new Set(grouped.map((r) => r.dealerId).filter((x): x is number => x != null)));
  const dl = ids.length ? await prisma.dealer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf: Record<number, string> = {};
  dl.forEach((d) => (nameOf[d.id] = d.name));

  const map: Record<number, DealerRow> = {};
  for (const row of grouped) {
    const did = row.dealerId as number; if (did == null) continue;
    if (!map[did]) map[did] = blank(did, nameOf[did] || ("#" + did));
    const c = row._count._all;
    const b = S2B[row.orderStatus || ""] || "Other";
    (map[did] as any)[b] += c;
    map[did].assigned += c;
    if (UNTOUCHED.has(row.orderStatus || "")) map[did].untouched += c; else map[did].worked += c;
  }

  const dealers = Object.values(map).sort((a, b) => b.assigned - a.assigned);
  const totals = blank(0, "TOTAL");
  for (const d of dealers) {
    totals.assigned += d.assigned; totals.worked += d.worked; totals.untouched += d.untouched;
    totals["GPO Pending"] += d["GPO Pending"]; totals["GPO Done"] += d["GPO Done"];
    totals.Delivered += d.Delivered; totals.Cancelled += d.Cancelled; totals.Other += d.Other;
  }
  return ok({ scope: viewAll ? "all" : "own", dealers, totals });
}
