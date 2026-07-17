import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { generateLabel, shiprocketError } from "@/lib/shiprocket";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.label");
  if (g instanceof Response) return g;
  const { orderId } = await req.json().catch(() => ({}));
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });
  if (!order?.shipmentId) return bad("Order has no shipmentId (book first)", 400);
  try { const url = await generateLabel(order.shipmentId); if (url) await prisma.order.update({ where: { id: order.id }, data: { labelUrl: url } }); return ok({ labelUrl: url }); }
  catch (e) { return bad("Label failed: " + shiprocketError(e), 502); }
}