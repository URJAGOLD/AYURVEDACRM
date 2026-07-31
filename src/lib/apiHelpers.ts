import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "./auth";
import { can, type AuthUser, type PermissionKey } from "./permissions";
import { prisma } from "./prisma";

export function ok(data: any, status = 200) { return NextResponse.json(data, { status }); }
export function bad(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

/** Guard: returns { user } or a NextResponse error. */
export function requirePermission(req: NextRequest, permission: PermissionKey | null): { user: AuthUser } | NextResponse {
  const user = getAuthUser(req);
  if (!user) return bad("Unauthorized - please log in", 401);
  if (permission && !can(user, permission)) return bad("Forbidden - you do not have access", 403);
  return { user };
}
export function requireAuth(req: NextRequest) { return requirePermission(req, null); }

export async function audit(userId: number | null, action: string, entityType?: string, entityId?: string | number, details?: any) {
  try {
    await prisma.auditLog.create({ data: {
      userId: userId ?? undefined, action, entityType,
      entityId: entityId != null ? String(entityId) : undefined, details: details != null ? JSON.stringify(details) : undefined,
    }});
  } catch (e) { console.error("[audit]", (e as Error).message); }
}