import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { decryptSecret } from "@/lib/crypto";
import { loginWithCreds, fetchPickupLocations, clearShiprocketTokenCache, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const acc = await prisma.shiprocketAccount.findUnique({ where: { id } });
  if (!acc) return bad("Account not found", 404);
  const { action } = await req.json().catch(() => ({}));

  if (action === "activate") {
    await prisma.$transaction([
      prisma.shiprocketAccount.updateMany({ data: { isActive: false }, where: { isActive: true } }),
      prisma.shiprocketAccount.update({ where: { id }, data: { isActive: true } }),
    ]);
    await clearShiprocketTokenCache(id); await clearShiprocketTokenCache(0);
    await audit(g.user.id, "shiprocket.account.activate", "shiprocketAccount", id, { label: acc.label });
    return ok({ activated: true });
  }

  if (action === "test" || action === "pickup") {
    try {
      const token = await loginWithCreds(acc.email, decryptSecret(acc.passwordEnc), acc.baseUrl || undefined);
      const pickups = await fetchPickupLocations(token, acc.baseUrl || undefined).catch(() => []);
      await prisma.shiprocketAccount.update({ where: { id }, data: { lastTestAt: new Date(), lastTestOk: true, lastTestMessage: "Login OK" } });
      await audit(g.user.id, "shiprocket.account.test", "shiprocketAccount", id, { ok: true });
      return ok({ ok: true, message: "Connection successful", pickupLocations: (pickups || []).map((p: any) => ({ name: p.pickup_location || p.name || "-", city: p.city || "", pin: p.pin_code || p.pin || "" })) });
    } catch (e) {
      const msg = shiprocketError(e);
      await prisma.shiprocketAccount.update({ where: { id }, data: { lastTestAt: new Date(), lastTestOk: false, lastTestMessage: msg } }).catch(() => {});
      await audit(g.user.id, "shiprocket.account.test", "shiprocketAccount", id, { ok: false, error: msg });
      return ok({ ok: false, message: msg });
    }
  }
  return bad("Unknown action");
}