import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { pin: string } }) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const pin = String(params.pin || "").replace(/\D/g, "");
  if (pin.length !== 6) return ok({ found: false });
  const geo = await prisma.pincode.findUnique({ where: { pincode: pin } }).catch(() => null);
  if (!geo) return ok({ found: false });
  return ok({ found: true, place: geo.place, district: geo.district, state: geo.state });
}