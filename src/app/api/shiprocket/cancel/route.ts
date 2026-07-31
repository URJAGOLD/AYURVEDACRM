import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { cancelShipment, shiprocketError } from "@/lib/shiprocket";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.cancel");
  if (g instanceof Response) return g;
  const { orderId } = await req.json().catch(() => ({}));
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });
  if (!order?.shiprocketOrderId) return bad("Order not booked on Shiprocket", 400);
  try {
    const data = await cancelShipment([order.shiprocketOrderId]);
    await prisma.order.update({ where: { id: order.id }, data: { shippingStatus: "CANCELLED" } });
    await prisma.orderHistory.create({ data: { orderId: order.id, status: "Shiprocket Cancelled", addedById: g.user.id } });
    await audit(g.user.id, "shiprocket.cancel", "order", order.id);
    return ok({ success: true, data });
  } catch (e) { return bad("Cancel failed: " + shiprocketError(e), 502); }
}