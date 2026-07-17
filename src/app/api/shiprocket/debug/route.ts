import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// Admin-only developer debug: latest Shiprocket booking audit (request/response/http) for an order
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return bad("orderId required");
  const logs = await prisma.auditLog.findMany({
    where: { action: "shiprocket.book", entityId: String(orderId) },
    orderBy: { createdAt: "desc" }, take: 5,
    include: { user: { select: { name: true } } },
  });
  return ok({ logs: logs.map((l) => ({ id: l.id, createdAt: l.createdAt, user: l.user?.name || null, details: (() => { try { return JSON.parse(l.details || "null"); } catch { return l.details; } })() })) });
}