import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";
import { BUCKET_MAP } from "@/lib/statuses";

export const runtime = "nodejs";

// Phase 4-C: Agent Productivity = status-CHANGES each agent made within a date window,
// from the clean OrderStatusActivity engine (NOT the OrderHistory-based assignment view).
// SUPER_ADMIN / MANAGER (orders.viewAll) get every agent; a plain AGENT gets only own.
// System/webhook changes (changedById = null) are excluded — this is human-agent productivity.

const STATUS_TO_BUCKET: Record<string, string> = {};
for (const [b, arr] of Object.entries(BUCKET_MAP)) for (const s of arr) STATUS_TO_BUCKET[s] = b;
const BUCKETS = ["New", "Calling", "Callback", "Pending", "Confirmed", "Shipped", "GPO Done", "Delivered", "Cancelled", "Other"];

type Row = { agentId: number; name: string; total: number; byBucket: Record<string, number> };
function blank(agentId: number, name: string): Row {
  const byBucket: Record<string, number> = {}; for (const b of BUCKETS) byBucket[b] = 0;
  return { agentId, name, total: 0, byBucket };
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const viewAll = can(user, "orders.viewAll");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from"), to = sp.get("to");

  const where: any = { changedById: { not: null }, order: { isDeleted: false } };
  if (!viewAll) where.changedById = user.id;
  if (from || to) where.changedAt = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) };

  const grouped = await prisma.orderStatusActivity.groupBy({ by: ["changedById", "newStatus"], where, _count: { _all: true } });

  const ids = Array.from(new Set(grouped.map((r) => r.changedById).filter((x): x is number => x != null)));
  const usersList = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf: Record<number, string> = {}; usersList.forEach((u) => (nameOf[u.id] = u.name));

  const map: Record<number, Row> = {};
  const totals = blank(0, "TOTAL");
  for (const r of grouped) {
    const aid = r.changedById as number; if (aid == null) continue;
    if (!map[aid]) map[aid] = blank(aid, nameOf[aid] || ("#" + aid));
    const c = r._count._all;
    const bucket = STATUS_TO_BUCKET[r.newStatus || ""] || "Other";
    map[aid].byBucket[bucket] += c; map[aid].total += c;
    totals.byBucket[bucket] += c; totals.total += c;
  }
  const agents = Object.values(map).sort((a, b) => b.total - a.total);

  return ok({ scope: viewAll ? "all" : "own", from: from || null, to: to || null, buckets: BUCKETS, agents, totals });
}
