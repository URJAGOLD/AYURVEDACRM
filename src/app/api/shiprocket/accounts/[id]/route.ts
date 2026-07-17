import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { encryptSecret } from "@/lib/crypto";
import { clearShiprocketTokenCache } from "@/lib/shiprocket";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const exists = await prisma.shiprocketAccount.findUnique({ where: { id } });
  if (!exists) return bad("Account not found", 404);
  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (b.label != null) data.label = String(b.label);
  if (b.email != null) data.email = String(b.email).trim();
  if (b.password) data.passwordEnc = encryptSecret(String(b.password));
  if (b.baseUrl !== undefined) data.baseUrl = b.baseUrl || null;
  if (b.pickupLocation != null) data.pickupLocation = b.pickupLocation || "Primary";
  if (b.webhookToken !== undefined) data.webhookToken = b.webhookToken || null;
  const acc = await prisma.shiprocketAccount.update({ where: { id }, data });
  await clearShiprocketTokenCache(id);
  await audit(g.user.id, "shiprocket.account.update", "shiprocketAccount", id, { changed: Object.keys(data) });
  const { passwordEnc, ...rest } = acc as any;
  return ok({ account: { ...rest, hasPassword: !!passwordEnc } });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const acc = await prisma.shiprocketAccount.findUnique({ where: { id } });
  if (!acc) return bad("Account not found", 404);
  await prisma.shiprocketAccount.delete({ where: { id } });
  await clearShiprocketTokenCache(id);
  if (acc.isActive) {
    const next = await prisma.shiprocketAccount.findFirst({ orderBy: { id: "desc" } });
    if (next) await prisma.shiprocketAccount.update({ where: { id: next.id }, data: { isActive: true } });
  }
  await audit(g.user.id, "shiprocket.account.delete", "shiprocketAccount", id, { label: acc.label });
  return ok({ deleted: true });
}