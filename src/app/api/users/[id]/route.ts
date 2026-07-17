import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { ALL_PERMISSION_KEYS, defaultPermissionsForRole, type RoleName } from "@/lib/permissions";

export const runtime = "nodejs";
const VALID_ROLES: RoleName[] = ["SUPER_ADMIN","MANAGER","AGENT","VIEWER","DEALER"];

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return bad("User not found", 404);
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.phone === "string") data.phone = body.phone;
  if (typeof body.isActive === "boolean") {
    if (!body.isActive && target.role === "SUPER_ADMIN") {
      const n = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
      if (n <= 1) return bad("Cannot deactivate the only active Super Admin");
    }
    data.isActive = body.isActive;
  }
  if (body.role && VALID_ROLES.includes(body.role)) {
    data.role = body.role;
    if (!body.permissions) data.permissions = JSON.stringify(defaultPermissionsForRole(body.role as RoleName));
  }
  if ("dealerId" in body) data.dealerId = body.dealerId ? Number(body.dealerId) : null;
  if (body.permissions && typeof body.permissions === "object") {
    const current = typeof target.permissions === "string" ? (() => { try { return JSON.parse(target.permissions); } catch { return {}; } })() : (target.permissions || {});
    const merged = { ...current };
    for (const key of ALL_PERMISSION_KEYS) if (key in body.permissions) merged[key] = body.permissions[key] === true;
    data.permissions = JSON.stringify(merged);
  }
  if (body.password) {
    if (String(body.password).length < 6) return bad("Password must be at least 6 characters");
    data.passwordHash = await hashPassword(body.password); data.mustChangePw = false;
  }
  const updated = await prisma.user.update({ where: { id }, data, select: { id:true, name:true, email:true, role:true, isActive:true, permissions:true } });
  {
    const before: Record<string, any> = {}; const after: Record<string, any> = {};
    for (const k of Object.keys(data)) {
      if (k === "passwordHash" || k === "mustChangePw") continue; // never store secrets
      before[k] = (target as any)[k]; after[k] = data[k];
    }
    await audit(g.user.id, "user.update", "user", id, { changed: Object.keys(data).filter((k) => k !== "passwordHash"), before, after });
  }
  return ok({ user: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const id = Number(params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return bad("User not found", 404);
  if (target.role === "SUPER_ADMIN") {
    const n = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (n <= 1) return bad("Cannot remove the only active Super Admin");
  }
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await audit(g.user.id, "user.deactivate", "user", id);
  return ok({ success: true, message: "User deactivated" });
}