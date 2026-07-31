import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { can, canAssign } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { ids, agentId, dealerId } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) return bad("ids[] required");
  const data: any = {};
  if (agentId !== undefined) {
    if (!canAssign(g.user)) return bad("Only Admin / Super Admin can assign Lead Owner", 403);
    data.leadOwnerId = agentId ? Number(agentId) : null; data.agentAssignDate = agentId ? new Date() : null;
  }
  if (dealerId !== undefined) {
    if (!canAssign(g.user)) return bad("Only Admin / Super Admin can assign Dealer", 403);
    data.dealerId = dealerId ? Number(dealerId) : null; data.dealerAssignDate = dealerId ? new Date() : null;
  }
  if (Object.keys(data).length === 0) return bad("Nothing to assign");
  // Snapshot per-order before-state for rollback
  const beforeRows = await prisma.order.findMany({
    where: { id: { in: ids.map(Number) }, isDeleted: false },
    select: { id: true, orderStatus: true, leadOwnerId: true, agentAssignDate: true, dealerId: true, dealerAssignDate: true, leadOwner: { select: { name: true } } },
  });
  const r = await prisma.order.updateMany({ where: { id: { in: ids.map(Number) }, isDeleted: false }, data });
  await audit(g.user.id, "order.bulkAssign", "order", ids.join(","), {
    ...data,
    before: { perOrder: beforeRows.map((o) => ({ id: o.id, leadOwnerId: o.leadOwnerId, agentAssignDate: o.agentAssignDate?.toISOString() ?? null, dealerId: o.dealerId, dealerAssignDate: o.dealerAssignDate?.toISOString() ?? null })) },
  });
  // Phase 1: per-order Order Timeline entry for Lead Owner assign / reassign.
  if (agentId !== undefined) {
    const newOwnerName = agentId
      ? ((await prisma.user.findUnique({ where: { id: Number(agentId) }, select: { name: true } }))?.name ?? ("#" + agentId))
      : null;
    const histRows = beforeRows.map((o: any) => {
      const oldName = o.leadOwner?.name ?? null;
      let remark: string;
      if (!newOwnerName) { if (!oldName) return null; remark = "\uD83D\uDEAB Lead owner removed (was " + oldName + ")"; }
      else if (!oldName) remark = "\uD83E\uDDD1\u200D\uD83D\uDCBC Assigned \u2192 " + newOwnerName;
      else if (oldName === newOwnerName) return null;
      else remark = "\uD83D\uDD01 Reassigned: " + oldName + " \u2192 " + newOwnerName;
      return { orderId: o.id, status: o.orderStatus, remark, addedById: g.user.id };
    }).filter(Boolean) as { orderId: number; status: string; remark: string; addedById: number }[];
    if (histRows.length) await prisma.orderHistory.createMany({ data: histRows });
  }
  return ok({ updated: r.count });
}