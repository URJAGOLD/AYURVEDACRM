import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";
import { BUCKET_MAP } from "@/lib/statuses";

export const runtime = "nodejs";

// BUCKET_MAP imported from @/lib/statuses (shared single source of truth).
const STATUS_TO_BUCKET: Record<string, string> = {};
for (const [b, arr] of Object.entries(BUCKET_MAP)) for (const s of arr) STATUS_TO_BUCKET[s] = b;

type AgentRow = {
  agentId: number; name: string; assigned: number; worked: number; untouched: number;
  New: number; Calling: number; Callback: number; Pending: number; Confirmed: number;
  Shipped: number; "GPO Done": number; Delivered: number; Cancelled: number; Other: number; overdue: number;
};
function blank(agentId: number, name: string): AgentRow {
  return { agentId, name, assigned: 0, worked: 0, untouched: 0, New: 0, Calling: 0, Callback: 0, Pending: 0, Confirmed: 0, Shipped: 0, "GPO Done": 0, Delivered: 0, Cancelled: 0, Other: 0, overdue: 0 };
}

// Agent workflow stats. SUPER_ADMIN / MANAGER (orders.viewAll) get every agent +
// a totals block (Owner dashboard). A plain AGENT gets only their own row.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const viewAll = can(user, "orders.viewAll");
  const sp = req.nextUrl.searchParams;

  const baseWhere: any = { isDeleted: false, leadOwnerId: { not: null }, source: { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] } };
  if (!viewAll) baseWhere.leadOwnerId = user.id;
  const from = sp.get("assignFrom"), to = sp.get("assignTo");
  if (from || to) baseWhere.agentAssignDate = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) };

  const grouped = await prisma.order.groupBy({ by: ["leadOwnerId", "orderStatus"], where: baseWhere, _count: { _all: true } });

  // resolve names
  const ownerIds = Array.from(new Set(grouped.map((r) => r.leadOwnerId).filter((x): x is number => x != null)));
  const usersList = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
  const nameOf: Record<number, string> = {}; usersList.forEach((u) => (nameOf[u.id] = u.name));

  const map: Record<number, AgentRow> = {};
  for (const row of grouped) {
    const oid = row.leadOwnerId as number; if (oid == null) continue;
    if (!map[oid]) map[oid] = blank(oid, nameOf[oid] || ("#" + oid));
    const c = row._count._all;
    const bucket = STATUS_TO_BUCKET[row.orderStatus || ""] || "Other";
    (map[oid] as any)[bucket] += c;
    map[oid].assigned += c;
    if (row.orderStatus === "New") map[oid].untouched += c; else map[oid].worked += c;
  }

  // overdue per agent
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const todayStart = new Date(istNow.toISOString().slice(0, 10) + "T00:00:00.000+05:30");
  const odWhere: any = { ...baseWhere, followUpDate: { not: null, lt: todayStart } };
  const odGrouped = await prisma.order.groupBy({ by: ["leadOwnerId"], where: odWhere, _count: { _all: true } });
  for (const row of odGrouped) { const oid = row.leadOwnerId as number; if (oid != null && map[oid]) map[oid].overdue = row._count._all; }

  const agents = Object.values(map).sort((a, b) => b.assigned - a.assigned);

  const totals = blank(0, "TOTAL");
  for (const a of agents) {
    totals.assigned += a.assigned; totals.worked += a.worked; totals.untouched += a.untouched; totals.overdue += a.overdue;
    totals.New += a.New; totals.Calling += a.Calling; totals.Callback += a.Callback; totals.Pending += a.Pending;
    totals.Confirmed += a.Confirmed; totals.Shipped += a.Shipped; totals["GPO Done"] += a["GPO Done"];
    totals.Delivered += a.Delivered; totals.Cancelled += a.Cancelled; totals.Other += a.Other;
  }

  return ok({ scope: viewAll ? "all" : "own", agents, totals });
}