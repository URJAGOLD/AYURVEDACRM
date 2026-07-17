import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { encryptSecret, isEncryptionReady } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mask(a: any) { const { passwordEnc, ...rest } = a; return { ...rest, hasPassword: !!passwordEnc }; }

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const accounts = await prisma.shiprocketAccount.findMany({ orderBy: [{ isActive: "desc" }, { id: "asc" }] });
  return ok({ accounts: accounts.map(mask), encryptionReady: isEncryptionReady(), webhookUrl: "/api/shiprocket/webhook" });
}

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  if (!isEncryptionReady()) return bad("Server encryption key (APP_ENCRYPTION_KEY) not configured", 500);
  const b = await req.json().catch(() => ({}));
  if (!b.label || !b.email || !b.password) return bad("label, email, password required");
  const count = await prisma.shiprocketAccount.count();
  const makeActive = count === 0 || b.activate === true;
  const acc = await prisma.$transaction(async (tx) => {
    if (makeActive) await tx.shiprocketAccount.updateMany({ data: { isActive: false }, where: { isActive: true } });
    return tx.shiprocketAccount.create({ data: {
      label: String(b.label), email: String(b.email).trim(), passwordEnc: encryptSecret(String(b.password)),
      baseUrl: b.baseUrl || null, pickupLocation: b.pickupLocation || "Primary", webhookToken: b.webhookToken || null,
      isActive: makeActive, createdById: g.user.id,
    }});
  });
  await audit(g.user.id, "shiprocket.account.create", "shiprocketAccount", acc.id, { label: acc.label, active: makeActive });
  return ok({ account: mask(acc) }, 201);
}