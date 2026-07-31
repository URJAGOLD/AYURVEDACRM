import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfTodayIST(): Date {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600000);
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 3600000);
  const todayStart = startOfTodayIST();
  const out: any = {};
  try {
    const [total, today, failed24h, deletes24h] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.auditLog.count({ where: { action: "auth.login_failed", createdAt: { gte: since24 } } }),
      prisma.auditLog.count({ where: { action: { contains: "delete" }, createdAt: { gte: since24 } } }),
    ]);
    out.counts = { total, today, failed24h, deletes24h };
  } catch (e: any) { out.counts = { error: e?.message }; }
  try {
    const grouped = await prisma.auditLog.groupBy({ by: ["action"], _count: { action: true }, orderBy: { _count: { action: "desc" } } });
    out.actions = grouped.map((r: any) => ({ action: r.action, count: r._count.action }));
  } catch { out.actions = []; }
  try {
    out.users = await prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  } catch { out.users = []; }
  return ok(out);
}