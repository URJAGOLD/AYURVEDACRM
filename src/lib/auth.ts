import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import type { AuthUser, RoleName } from "./permissions";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

export async function hashPassword(plain: string) { return bcrypt.hash(plain, 10); }
export async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash); }
export function signToken(user: AuthUser): string {
  return jwt.sign(user as object, JWT_SECRET as jwt.Secret, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const d = jwt.verify(token, JWT_SECRET) as any;
    return { id: d.id, name: d.name, email: d.email, role: d.role as RoleName, permissions: d.permissions || {}, dealerId: d.dealerId ?? null };
  } catch { return null; }
}
export function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get("ph_token")?.value || null;
}
export function getAuthUser(req: NextRequest): AuthUser | null {
  const t = getTokenFromRequest(req);
  return t ? verifyToken(t) : null;
}