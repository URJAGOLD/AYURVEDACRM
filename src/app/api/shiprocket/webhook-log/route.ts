import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// GET /api/shiprocket/webhook-log?limit=50&action=error
// Admin monitoring: see webhook history, errors, and sync stats
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") || 50), 200);
  const action = sp.get("action") || undefined;
  const event = sp.get("event") || undefined;
  const where: any = { source: "shiprocket" };
  if (action) where.action = action;
  if (event) where.event = event;

  const [logs, total, summary] = await Promise.all([
    prisma.webhookLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, event: true, awb: true, orderId: true, srOrderId: true, action: true, note: true, createdAt: true } }),
    prisma.webhookLog.count({ where: { source: "shiprocket" } }),
    prisma.webhookLog.groupBy({ by: ["event", "action"], where: { source: "shiprocket" }, _count: { _all: true }, orderBy: { _count: { _all: "desc" } } }),
  ]);

  const lastHit = logs[0]?.createdAt ?? null;
  const errorCount = summary.filter((r: any) => r.action === "error").reduce((s: number, r: any) => s + r._count._all, 0);
  const createdCount = summary.filter((r: any) => r.action === "created").reduce((s: number, r: any) => s + r._count._all, 0);
  const updatedCount = summary.filter((r: any) => r.action === "updated").reduce((s: number, r: any) => s + r._count._all, 0);
  const ignoredCount = summary.filter((r: any) => r.action === "ignored").reduce((s: number, r: any) => s + r._count._all, 0);

  return ok({ total, lastHit, stats: { created: createdCount, updated: updatedCount, ignored: ignoredCount, errors: errorCount }, summary, logs });
}