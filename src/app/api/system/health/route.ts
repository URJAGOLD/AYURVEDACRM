import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSED = ["Delivered","GPO Delivered","Cancelled","Final cancel","Confirm cancel","Dealer Cancel","RTO","UNA"];
const BACKUP_DIR = "/var/backups/prakriti_crm";

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
  const out: any = { generatedAt: now.toISOString() };

  try {
    const t0 = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    out.api = { status: "ok", dbLatencyMs: Date.now() - t0 };
  } catch (e: any) { out.api = { status: "down", error: e?.message }; }

  try {
    const rows: any[] = await prisma.$queryRawUnsafe("SELECT pg_database_size(current_database())::text AS size, current_database() AS name");
    out.db = { name: rows?.[0]?.name, sizeBytes: Number(rows?.[0]?.size || 0) };
  } catch (e: any) { out.db = { error: e?.message }; }

  try {
    const [total, active, recentlyActive] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { lastLoginAt: { gte: since24 } } }),
    ]);
    out.users = { total, active, recentlyActive };
  } catch (e: any) { out.users = { error: e?.message }; }

  try {
    const [s, f] = await Promise.all([
      prisma.auditLog.count({ where: { action: "auth.login", createdAt: { gte: since24 } } }),
      prisma.auditLog.count({ where: { action: "auth.login_failed", createdAt: { gte: since24 } } }),
    ]);
    out.logins = { success24h: s, failed24h: f };
  } catch (e: any) { out.logins = { error: e?.message }; }

  try {
    const [total, today, newBacklog, pendingFollowups, overdueFollowups] = await Promise.all([
      prisma.order.count({ where: { isDeleted: false } }),
      prisma.order.count({ where: { isDeleted: false, dateTime: { gte: todayStart } } }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: "New" } }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: { notIn: CLOSED }, followUpDate: { gte: todayStart } } }),
      prisma.order.count({ where: { isDeleted: false, orderStatus: { notIn: CLOSED }, followUpDate: { lt: todayStart, not: null } } }),
    ]);
    out.orders = { total, today, newBacklog, pendingFollowups, overdueFollowups };
  } catch (e: any) { out.orders = { error: e?.message }; }

  try {
    const booked = await prisma.order.count({ where: { bookedAt: { not: null } } });
    const last = await prisma.order.findFirst({ where: { bookedAt: { not: null } }, orderBy: { bookedAt: "desc" }, select: { bookedAt: true } });
    const sEmail = process.env.SHIPROCKET_EMAIL || process.env.SHIPROCKET_API_EMAIL || process.env.SR_EMAIL || "";
    const credsConfigured = !!sEmail && !/placeholder|example|changeme|your-/i.test(sEmail);
    out.shiprocket = { webhookEndpoint: "/api/shiprocket/webhook", credsConfigured, ordersBooked: booked, lastBookedAt: last?.bookedAt ?? null, status: credsConfigured ? (booked > 0 ? "active" : "ready") : "creds_pending" };
  } catch (e: any) { out.shiprocket = { error: e?.message }; }

  try {
    const events24h = await prisma.syncEvent.count({ where: { createdAt: { gte: since24 } } });
    const last = await prisma.syncEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, source: true } });
    out.sync = { events24h, lastAt: last?.createdAt ?? null, lastSource: last?.source ?? null };
  } catch (e: any) { out.sync = { error: e?.message }; }

  try {
    const files = (await fs.readdir(BACKUP_DIR)).filter((x) => x.endsWith(".sql.gz"));
    if (!files.length) { out.backup = { status: "none", message: "No backup file yet (timer runs nightly)" }; }
    else {
      let newest: { file: string; mtime: number; size: number } | null = null;
      for (const fn of files) { const st = await fs.stat(path.join(BACKUP_DIR, fn)); if (!newest || st.mtimeMs > newest.mtime) newest = { file: fn, mtime: st.mtimeMs, size: st.size }; }
      const ageH = newest ? (Date.now() - newest.mtime) / 3600000 : null;
      out.backup = { status: ageH != null && ageH <= 36 ? "ok" : "stale", lastBackupAt: newest ? new Date(newest.mtime).toISOString() : null, sizeBytes: newest?.size ?? null, file: newest?.file ?? null, count: files.length };
    }
  } catch (e: any) { out.backup = { status: "not_configured", message: "Backup directory not accessible" }; }

  return ok(out);
}