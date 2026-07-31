import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.delete");
  if (g instanceof Response) return g;
  const { user } = g;
  const b = await req.json().catch(() => ({}));
  const ids = (b.ids || []).map((x: any) => Number(x)).filter((n: number) => n > 0);
  if (!ids.length) return bad("No ids provided");
  const where: any = { id: { in: ids }, isDeleted: false };
  if (!can(user, "orders.viewAll")) where.leadOwnerId = user.id;
  const affected = await prisma.order.findMany({ where, select: { id: true } });
  const affectedIds = affected.map((o) => o.id);
  const r = await prisma.order.updateMany({ where, data: { isDeleted: true } });
  await audit(user.id, "order.bulkDelete", "order", 0, { count: r.count, ids: affectedIds, before: { isDeleted: false } });
  return ok({ deleted: r.count });
}