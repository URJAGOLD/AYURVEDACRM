import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";
import { buildExportWorkbook } from "@/lib/excel";
import { parseTags } from "@/lib/dbHelpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.export");
  if (g instanceof Response) return g;
  const { user } = g;
  const sp = req.nextUrl.searchParams;
  const where: any = { isDeleted: false };
  if (!can(user, "orders.viewAll")) where.leadOwnerId = user.id;
  if (sp.get("status")) where.orderStatus = sp.get("status");
  if (sp.get("source")) where.source = sp.get("source"); else if (sp.get("hideActivities") === "1") where.source = { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] };
  if (sp.get("payment")) where.paymentStatus = sp.get("payment");
  if (sp.get("phone")) where.contactNumber = { contains: sp.get("phone") };
  // Phase 4-B: export honors order-date range + status-change date/status filter (same as list).
  { const f = sp.get("orderFrom"), t = sp.get("orderTo"); if (f || t) where.dateTime = { ...(f ? { gte: new Date(f + "T00:00:00.000+05:30") } : {}), ...(t ? { lte: new Date(t + "T23:59:59.999+05:30") } : {}) }; }
  { const sf = sp.get("statusFrom"), st = sp.get("statusTo"), sStat = sp.get("statusChange");
    if (sf || st || sStat) where.statusActivity = { some: {
      ...((sf || st) ? { changedAt: { ...(sf ? { gte: new Date(sf + "T00:00:00.000+05:30") } : {}), ...(st ? { lte: new Date(st + "T23:59:59.999+05:30") } : {}) } } : {}),
      ...(sStat ? { newStatus: sStat } : {}),
    } }; }

  const orders = await prisma.order.findMany({ where, take: 50000, orderBy: { id: "desc" },
    include: { state: true, district: true, dealer: true, leadOwner: true, zoneManager: { select: { name: true } } } });
  const _ids = orders.map((o) => o.id);
  const _lastMap: Record<number, Date> = {};
  if (_ids.length && _ids.length <= 20000) {
    const _la = await prisma.orderStatusActivity.groupBy({ by: ["orderId"], where: { orderId: { in: _ids } }, _max: { changedAt: true } });
    _la.forEach((a: any) => { if (a._max.changedAt) _lastMap[a.orderId] = a._max.changedAt; });
  }
  const rows = orders.map(o => ({
    OrderId:o.orderCode, Date:o.dateTime.toISOString().slice(0,19).replace("T"," "), Customer:o.customerName,
    Contact:o.contactNumber, Product:o.productName, Qty:o.quantity, Price:Number(o.price), Address:o.address,
    City:o.city, State:o.state?.name ?? "", District:o.district?.name ?? "", Pincode:o.pincode, Status:o.orderStatus,
    Payment:o.paymentStatus, Source:o.source, LeadOwner:o.leadOwner?.name ?? "", Dealer:o.dealer?.name ?? "",
    FollowUp:o.followUpDate ? o.followUpDate.toISOString().slice(0,10) : "", AWB:o.awbCode ?? "", Courier:o.courierName ?? "", ShippingStatus:o.shippingStatus ?? "",
    Total: o.totalAmount != null ? Number(o.totalAmount) : Number(o.price) * (o.quantity || 1),
    OnlinePaid: Number(o.onlinePaid || 0),
    Balance: (o.totalAmount != null ? Number(o.totalAmount) : Number(o.price) * (o.quantity || 1)) - Number(o.onlinePaid || 0),
    PaymentMode: o.paymentMode ?? "", AltMobile: o.altMobile ?? "",
    AgentAssignDate: o.agentAssignDate ? o.agentAssignDate.toISOString().slice(0,10) : "",
    DealerAssignDate: o.dealerAssignDate ? o.dealerAssignDate.toISOString().slice(0,10) : "",
    ZM: o.zoneManager?.name ?? "", Remark: o.remark ?? "", SourceTags: parseTags(o.sourceTags).join(", "),
    LastStatusChange: _lastMap[o.id] ? _lastMap[o.id].toISOString().slice(0,19).replace("T"," ") : "",
  }));
  const buf = await buildExportWorkbook(rows);
  return new NextResponse(buf as any, { status: 200, headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename=\"orders_" + Date.now() + ".xlsx\"",
  }});
}