import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken } from "@/lib/auth";
import { defaultPermissionsForRole, type RoleName } from "@/lib/permissions";
import { audit, bad } from "@/lib/apiHelpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return bad("Email and password required");
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (!user || !user.isActive) { await audit(user?.id ?? null, "auth.login_failed", "user", user?.id, { email: String(email).toLowerCase().trim(), reason: user ? "inactive" : "no_user" }); return bad("Invalid credentials or inactive account", 401); }
  if (!(await verifyPassword(password, user.passwordHash))) { await audit(user.id, "auth.login_failed", "user", user.id, { email: user.email, reason: "bad_password" }); return bad("Invalid credentials", 401); }

  const defaults = defaultPermissionsForRole(user.role as RoleName);
  const stored = typeof user.permissions === "string" ? (() => { try { return JSON.parse(user.permissions); } catch { return {}; } })() : (user.permissions || {});
  const permissions = { ...defaults, ...stored };
  const authUser = { id: user.id, name: user.name, email: user.email, role: user.role as RoleName, permissions, dealerId: (user as any).dealerId ?? null };
  const token = signToken(authUser);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, "auth.login", "user", user.id);

  const res = NextResponse.json({ token, user: { ...authUser, mustChangePw: user.mustChangePw } });
  res.cookies.set("ph_token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}