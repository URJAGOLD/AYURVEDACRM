import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { defaultPermissionsForRole, ALL_PERMISSION_KEYS, type RoleName } from "@/lib/permissions";

export const runtime = "nodejs";
const VALID_ROLES: RoleName[] = ["SUPER_ADMIN","MANAGER","AGENT","VIEWER","DEALER"];

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id:true, name:true, email:true, phone:true, role:true, permissions:true, isActive:true, lastLoginAt:true, createdAt:true, dealerId:true },
  });
  return ok({ users });
}

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const { name, email, phone, password, role, permissions, dealerId } = await req.json().catch(() => ({}));
  if (!name || !email || !password) return bad("name, email, password required");
  const roleName: RoleName = VALID_ROLES.includes(role) ? role : "AGENT";
  if (roleName === "DEALER" && !dealerId) return bad("Dealer user ke liye dealer chunna zaroori hai");
  if (String(password).length < 6) return bad("Password must be at least 6 characters");
  const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (existing) return bad("A user with this email already exists", 409);

  const perms = defaultPermissionsForRole(roleName);
  if (permissions && typeof permissions === "object")
    for (const key of ALL_PERMISSION_KEYS) if (key in permissions) perms[key] = permissions[key] === true;

  const created = await prisma.user.create({
    data: {
      name, email: String(email).toLowerCase().trim(), phone: phone || null,
      passwordHash: await hashPassword(password), role: roleName,
      permissions: JSON.stringify(perms), isActive: true, mustChangePw: true, createdById: g.user.id,
      dealerId: roleName === "DEALER" && dealerId ? Number(dealerId) : null,
    },
    select: { id:true, name:true, email:true, role:true, isActive:true },
  });
  await audit(g.user.id, "user.create", "user", created.id, { email: created.email, role: roleName });
  return ok({ user: created }, 201);
}