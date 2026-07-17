import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { logStatusActivityBulk } from "@/lib/statusActivity";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.changeStatus");
  if (g instanceof Response) return g;
  const { ids, status } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) return bad("ids[] required");
  if (!status) return bad("status required");
  const beforeRows = await prisma.order.findMany({ where: { id: { in: ids.map(Number) }, isDeleted: false }, select: { id: true, orderStatus: true, leadOwnerId: true, dealerId: true } });
  const r = await prisma.order.updateMany({ where: { id: { in: ids.map(Number) }, isDeleted: false }, data: { orderStatus: status } });
  await prisma.orderHistory.createMany({ data: ids.map((id: number) => ({ orderId: Number(id), status, remark: "Bulk status change", addedById: g.user.id })) });
  // Phase 4-A: clean status-activity log (per-order previous->new; never blocks the update).
  await logStatusActivityBulk(beforeRows.map((o) => ({ orderId: o.id, previousStatus: o.orderStatus, newStatus: status, source: "bulk", changedById: g.user.id, leadOwnerId: o.leadOwnerId, dealerId: o.dealerId })));
  await audit(g.user.id, "order.bulkStatus", "order", ids.join(","), { status, before: { perOrder: beforeRows.map((o) => ({ id: o.id, orderStatus: o.orderStatus })) } });
  return ok({ updated: r.count });
}