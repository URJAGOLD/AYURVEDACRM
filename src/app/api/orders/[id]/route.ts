import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { can, canAssign, DEALER_ALLOWED_STATUSES } from "@/lib/permissions";
import { logStatusActivity } from "@/lib/statusActivity";

export const runtime = "nodejs";

async function loadScoped(id: number, user: any) {
  const order = await prisma.order.findFirst({
    where: { id, isDeleted: false },
    include: {
      state: { select: { name:true } }, district: { select: { name:true } },
      dealer: { select: { id:true, name:true } }, leadOwner: { select: { id:true, name:true } },
      history: { orderBy: { createdAt: "desc" }, include: { addedBy: { select: { name:true } } } },
    },
  });
  if (!order) return null;
  if (!can(user, "orders.viewAll")) {
    if (user.role === "DEALER") { if (order.dealerId == null || order.dealerId !== (user.dealerId ?? -1)) return "forbidden"; }
    else if (order.leadOwnerId !== user.id) return "forbidden";
  }
  return order;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const order = await loadScoped(Number(params.id), g.user);
  if (order === null) return bad("Order not found", 404);
  if (order === "forbidden") return bad("Forbidden", 403);
  const statusActivity = await prisma.orderStatusActivity.findMany({
    where: { orderId: Number(params.id) },
    orderBy: { changedAt: "desc" },
    take: 100,
    include: { changedBy: { select: { name: true } } },
  });
  return ok({ order: { ...order, statusActivity } });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "orders.edit");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const current = await loadScoped(id, g.user);
  if (current === null) return bad("Order not found", 404);
  if (current === "forbidden") return bad("Forbidden", 403);
  const b = await req.json().catch(() => ({}));
  if (g.user.role === "DEALER") {
    for (const k of Object.keys(b)) if (!["orderStatus","remark","followUpDate"].includes(k)) delete (b as any)[k];
    if (b.orderStatus && !DEALER_ALLOWED_STATUSES.includes(b.orderStatus)) return bad("Dealer login sirf ye status set kar sakta hai: " + DEALER_ALLOWED_STATUSES.join(", "), 403);
  }
  const data: any = {};
  for (const f of ["customerName","email","productName","productSku","address","city","source","reason","remark","paymentStatus","paymentMode"]) if (f in b) data[f] = b[f];
  if ("contactNumber" in b) data.contactNumber = String(b.contactNumber).replace(/\D/g, "");
  if ("quantity" in b) data.quantity = Number(b.quantity) || 1;
  if ("price" in b) data.price = Number(b.price) || 0;
  if ("pincode" in b) data.pincode = String(b.pincode).replace(/\D/g, "");
  if ("altMobile" in b) data.altMobile = b.altMobile ? String(b.altMobile).replace(/\D/g, "").slice(-10) : null;
  if ("totalAmount" in b) data.totalAmount = (b.totalAmount === "" || b.totalAmount === null) ? null : Number(b.totalAmount);
  if ("onlinePaid" in b) data.onlinePaid = Number(b.onlinePaid) || 0;
  if ("stateId" in b) data.stateId = b.stateId ? Number(b.stateId) : null;
  if ("districtId" in b) data.districtId = b.districtId ? Number(b.districtId) : null;
  if ("followUpDate" in b) data.followUpDate = b.followUpDate ? new Date(b.followUpDate) : null;
  if ("orderStatus" in b && b.orderStatus !== current.orderStatus) {
    if (!can(g.user, "orders.changeStatus")) return bad("No permission to change status", 403);
    data.orderStatus = b.orderStatus;
  }
  if ("leadOwnerId" in b) {
    if (!canAssign(g.user)) return bad("Only Admin / Super Admin can reassign Lead Owner", 403);
    data.leadOwnerId = b.leadOwnerId ? Number(b.leadOwnerId) : null;
    data.agentAssignDate = b.leadOwnerId ? new Date() : null;
  }
  if ("dealerId" in b) {
    if (!canAssign(g.user)) return bad("Only Admin / Super Admin can assign Dealer", 403);
    data.dealerId = b.dealerId ? Number(b.dealerId) : null;
    data.dealerAssignDate = b.dealerId ? new Date() : null;
  }
  // Snapshot before-state for rollback support
  const before: Record<string, any> = {};
  const after: Record<string, any> = {};
  for (const k of Object.keys(data)) {
    const cv = (current as any)[k];
    before[k] = cv instanceof Date ? cv.toISOString() : (cv && typeof cv === "object" && "toNumber" in cv ? Number(cv) : cv);
    const nv = data[k];
    after[k] = nv instanceof Date ? nv.toISOString() : nv;
  }
  const updated = await prisma.order.update({ where: { id }, data });
  if (data.orderStatus) await prisma.orderHistory.create({ data: { orderId: id, status: data.orderStatus, remark: b.remark || null, addedById: g.user.id } });
  // Phase 4-A: clean status-activity log (additive; never blocks the update).
  if (data.orderStatus) await logStatusActivity({
    orderId: id,
    previousStatus: (current as any).orderStatus,
    newStatus: data.orderStatus,
    source: "manual",
    changedById: g.user.id,
    leadOwnerId: ("leadOwnerId" in data ? data.leadOwnerId : (current as any).leadOwnerId),
    dealerId: ("dealerId" in data ? data.dealerId : (current as any).dealerId),
  });
  // Phase 1: Order Timeline entry for Lead Owner assign / reassign.
  if ("leadOwnerId" in data && data.leadOwnerId !== (current as any).leadOwnerId) {
    const oldName = (current as any).leadOwner?.name ?? null;
    const newName = data.leadOwnerId
      ? ((await prisma.user.findUnique({ where: { id: data.leadOwnerId }, select: { name: true } }))?.name ?? ("#" + data.leadOwnerId))
      : null;
    let aremark: string;
    if (!newName) aremark = "\uD83D\uDEAB Lead owner removed" + (oldName ? " (was " + oldName + ")" : "");
    else if (!oldName) aremark = "\uD83E\uDDD1\u200D\uD83D\uDCBC Assigned \u2192 " + newName;
    else aremark = "\uD83D\uDD01 Reassigned: " + oldName + " \u2192 " + newName;
    await prisma.orderHistory.create({ data: { orderId: id, status: (data.orderStatus || (current as any).orderStatus), remark: aremark, addedById: g.user.id } });
  }
  await audit(g.user.id, "order.update", "order", id, { changed: Object.keys(data), before, after });
  return ok({ order: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "orders.delete");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const current = await loadScoped(id, g.user);
  if (current === null) return bad("Order not found", 404);
  if (current === "forbidden") return bad("Forbidden", 403);
  await prisma.order.update({ where: { id }, data: { isDeleted: true } });
  await audit(g.user.id, "order.delete", "order", id, { before: { isDeleted: false }, after: { isDeleted: true }, orderCode: (current as any).orderCode });
  return ok({ success: true });
}