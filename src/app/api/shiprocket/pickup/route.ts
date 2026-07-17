import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { requestPickup, shiprocketError } from "@/lib/shiprocket";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.pickup");
  if (g instanceof Response) return g;
  const { orderId } = await req.json().catch(() => ({}));
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });
  if (!order?.shipmentId) return bad("Order has no shipmentId (book first)", 400);
  try {
    const data = await requestPickup(order.shipmentId);
    await prisma.order.update({ where: { id: order.id }, data: { shippingStatus: "PICKUP SCHEDULED" } });
    await audit(g.user.id, "shiprocket.pickup", "order", order.id);
    return ok({ success: true, data });
  } catch (e) { return bad("Pickup failed: " + shiprocketError(e), 502); }
}