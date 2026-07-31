import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { generateAWB, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

// POST { orderId, courierId? } -> (re)assign AWB for an existing Shiprocket shipment.
// Used when AWB assignment failed at booking time (e.g. permission was fixed later).
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.book");
  if (g instanceof Response) return g;
  const { orderId, courierId } = await req.json().catch(() => ({}));
  if (!orderId) return bad("orderId required");
  const order = await prisma.order.findFirst({ where: { id: Number(orderId), isDeleted: false } });
  if (!order) return bad("Order not found", 404);
  if (!order.shipmentId) return bad("Order has no shipmentId (book first)", 400);
  if (order.awbCode) return bad("AWB already assigned: " + order.awbCode, 409);
  try {
    const awb = await generateAWB(order.shipmentId, courierId ? Number(courierId) : undefined);
    if (!awb.awbCode) return bad("Shiprocket returned no AWB (courier may have rejected). Try Auto / another courier.", 502);
    await prisma.order.update({ where: { id: order.id }, data: {
      awbCode: awb.awbCode, courierName: awb.courierName,
      shippingStatus: "Ready To Ship", trackingStage: "Ready To Ship",
      orderStatus: "GPO Done", bookedAt: order.bookedAt ?? new Date(),
    }});
    await prisma.orderHistory.create({ data: { orderId: order.id, status: "Shiprocket Booked", remark: "AWB: " + awb.awbCode, addedById: g.user.id } });
    await audit(g.user.id, "shiprocket.book", "order", order.id, { ok: true, awb: awb.awbCode, courier: awb.courierName, shipmentId: order.shipmentId, action: "awb_retry", courierId: courierId ?? null });
    return ok({ success: true, awb: awb.awbCode, courier: awb.courierName });
  } catch (e) { return bad("AWB assignment failed: " + shiprocketError(e), 502); }
}
