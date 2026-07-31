import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { cancelShipment, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

// POST { orderId } -> cancel current shipment (best effort) + clear shipment fields to allow rebook / courier change.
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.book");
  if (g instanceof Response) return g;
  const { orderId } = await req.json().catch(() => ({}));
  if (!orderId) return bad("orderId required");
  const order = await prisma.order.findFirst({ where: { id: Number(orderId), isDeleted: false } });
  if (!order) return bad("Order not found", 404);
  let cancelMsg = "no active shipment";
  if (order.shiprocketOrderId) {
    try { await cancelShipment([order.shiprocketOrderId]); cancelMsg = "Shiprocket order cancelled"; }
    catch (e) { cancelMsg = "cancel skipped: " + shiprocketError(e); }
  }
  await prisma.order.update({ where: { id: order.id }, data: {
    shiprocketOrderId: null, shipmentId: null, awbCode: null, courierName: null,
    labelUrl: null, manifestUrl: null, shippingStatus: null, trackingStage: null,
    expectedDelivery: null, rtoStatus: null, ndrStatus: null, lastTrackedAt: null, bookedAt: null,
    orderStatus: "Confirmed",
  }});
  await prisma.orderHistory.create({ data: { orderId: order.id, status: "Shipment Reset", remark: cancelMsg + " - ready to rebook", addedById: g.user.id } });
  await audit(g.user.id, "shiprocket.reset", "order", order.id, { cancelMsg });
  return ok({ reset: true, cancelMsg });
}