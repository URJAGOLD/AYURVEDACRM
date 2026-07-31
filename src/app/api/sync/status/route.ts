import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, bad, requirePermission } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — called by crm-sync-worker after each drain (x-ingest-secret auth)
export async function POST(req: NextRequest) {
  const secret = process.env.CRM_INGEST_SECRET;
  if (!secret || req.headers.get("x-ingest-secret") !== secret) return bad("Unauthorized", 401);
  const b = await req.json().catch(() => ({} as any));

  const crmOrderRows = await prisma.order.count({ where: { externalRef: { startsWith: "order-" }, isDeleted: false } });
  const adminOrders = Number(b.adminOrders) || 0;
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const syncedToday = await prisma.syncEvent.count({ where: { createdAt: { gte: startToday } } });

  const row = await prisma.syncStatus.upsert({
    where: { id: 1 },
    create: { id: 1, lastSyncAt: new Date(), adminOrders, crmOrderRows, syncedToday, pendingQueue: Number(b.pendingQueue) || 0, failed24h: Number(b.failed24h) || 0, missingOrders: Math.max(0, adminOrders - crmOrderRows), note: b.note ? String(b.note).slice(0, 300) : null },
    update: { lastSyncAt: new Date(), adminOrders, crmOrderRows, syncedToday, pendingQueue: Number(b.pendingQueue) || 0, failed24h: Number(b.failed24h) || 0, missingOrders: Math.max(0, adminOrders - crmOrderRows), note: b.note ? String(b.note).slice(0, 300) : null },
  });
  return ok({ saved: true, missingOrders: row.missingOrders });
}

// GET — System Health widget
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const row = await prisma.syncStatus.findUnique({ where: { id: 1 } });
  return ok({ status: row });
}