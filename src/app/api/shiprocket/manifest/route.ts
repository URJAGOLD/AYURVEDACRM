import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { generateManifest, shiprocketError } from "@/lib/shiprocket";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.label");
  if (g instanceof Response) return g;
  const { orderId } = await req.json().catch(() => ({}));
  const order = await prisma.order.findUnique({ where: { id: Number(orderId) } });
  if (!order?.shipmentId) return bad("Order has no shipmentId (book first)", 400);
  try { const url = await generateManifest(order.shipmentId); if (url) await prisma.order.update({ where: { id: order.id }, data: { manifestUrl: url } }); return ok({ manifestUrl: url }); }
  catch (e) { return bad("Manifest failed: " + shiprocketError(e), 502); }
}