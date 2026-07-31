import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

/**
 * Phase 3A - Sales Report API (additive, read-only).
 * Sales = ONLY "Delivered" + "GPO Delivered" (confirmed against CRM status list).
 * Revenue = price * quantity to stay consistent with /api/reports delivered revenue.
 */
const SALES_SET = ["Delivered", "GPO Delivered"];

function istDate(d: Date): string {
  return new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "reports.view");
  if (g instanceof Response) return g;

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const source = sp.get("source") || "";

  const where: any = { isDeleted: false, orderStatus: { in: SALES_SET } };
  if (from || to) {
    where.dateTime = {};
    if (from) where.dateTime.gte = new Date(from + "T00:00:00.000+05:30");
    if (to) where.dateTime.lte = new Date(to + "T23:59:59.999+05:30");
  }
  if (source) where.source = source; else where.source = { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] };

  const rows = await prisma.order.findMany({
    where,
    select: { orderStatus: true, source: true, dateTime: true, price: true, quantity: true },
  });

  const rev = (o: any) => Number(o.price || 0) * (o.quantity || 1);

  let total = 0, delivered = 0, gpoDelivered = 0, revenue = 0;
  const srcAgg: Record<string, any> = {};
  const dayAgg: Record<string, any> = {};

  (rows as any[]).forEach((o) => {
    const amt = rev(o);
    total += 1; revenue += amt;
    if (o.orderStatus === "GPO Delivered") gpoDelivered += 1; else delivered += 1;

    const sk = o.source || "(none)";
    if (!srcAgg[sk]) srcAgg[sk] = { source: sk, count: 0, delivered: 0, gpoDelivered: 0, revenue: 0 };
    srcAgg[sk].count += 1; srcAgg[sk].revenue += amt;
    if (o.orderStatus === "GPO Delivered") srcAgg[sk].gpoDelivered += 1; else srcAgg[sk].delivered += 1;

    const dk = istDate(o.dateTime);
    if (!dayAgg[dk]) dayAgg[dk] = { date: dk, count: 0, revenue: 0 };
    dayAgg[dk].count += 1; dayAgg[dk].revenue += amt;
  });

  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  const statusBreakdown = [
    { status: "Delivered", count: delivered, pct: pct(delivered) },
    { status: "GPO Delivered", count: gpoDelivered, pct: pct(gpoDelivered) },
  ].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

  const sourceBreakdown = Object.values(srcAgg)
    .map((r: any) => ({ ...r, revenue: Math.round(r.revenue), pct: pct(r.count) }))
    .sort((a: any, b: any) => b.count - a.count);

  const dailyBreakdown = Object.values(dayAgg)
    .map((r: any) => ({ ...r, revenue: Math.round(r.revenue) }))
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));

  return ok({
    summary: {
      total, delivered, gpoDelivered,
      revenue: Math.round(revenue),
      aov: total ? Math.round(revenue / total) : 0,
    },
    statusBreakdown, sourceBreakdown, dailyBreakdown,
  });
}