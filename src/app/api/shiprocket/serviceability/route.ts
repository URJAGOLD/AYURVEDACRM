import { NextRequest } from "next/server";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { checkServiceability, shiprocketError } from "@/lib/shiprocket";
export const runtime = "nodejs";
// GET ?delivery=110001&weight=0.5&cod=1
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.track");
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const delivery = sp.get("delivery");
  if (!delivery) return bad("delivery pincode required");
  try {
    const couriers = await checkServiceability(delivery, { pickupPin: sp.get("pickup") || undefined, weight: sp.get("weight") ? Number(sp.get("weight")) : undefined, cod: (sp.get("cod") === "0" ? 0 : 1) as 0 | 1 });
    return ok({ serviceable: couriers.length > 0, couriers });
  } catch (e) { return bad("Serviceability failed: " + shiprocketError(e), 502); }
}