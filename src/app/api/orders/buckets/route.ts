import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can, scopeFilter } from "@/lib/permissions";
import { TERMINAL_STATUSES, BUCKET_MAP } from "@/lib/statuses";

export const runtime = "nodejs";

// Workflow bucket counts. Honours SAME data-scoping + filters as the orders list,
// EXCEPT the status grouping itself.
// BUCKET_MAP now imported from @/lib/statuses (single source of truth).

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const sp = req.nextUrl.searchParams;
  const where: any = { isDeleted: false };
  Object.assign(where, scopeFilter(user));

  const eq = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = v; };
  const num = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = Number(v); };
  const contains = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = { contains: v, mode: "insensitive" }; };
  eq("payment", "paymentStatus"); eq("pincode", "pincode"); eq("product", "productName"); eq("paymentMode", "paymentMode");
  { const v = sp.get("onlinePaidOnly"); if (v === "1") where.onlinePaid = { gt: 0 }; }
  { const v = sp.get("minValue"); if (v && Number(v) > 0) where.totalAmount = { gte: Number(v) }; }
  { const v = sp.get("shipStatus"); if (v) { const arr = v.split(",").map((x) => x.trim()).filter(Boolean); if (arr.length) where.trackingStage = { in: arr }; } }
  num("stateId", "stateId"); num("districtId", "districtId"); num("dealerId", "dealerId"); num("zm", "zmId");
  { const and: any[] = [];
    { const v = sp.get("phone"); if (v) and.push({ OR: [{ contactNumber: { contains: v } }, { altMobile: { contains: v } }] }); }
    { const v = sp.get("source"); if (v) and.push({ OR: [{ source: v }, { sourceTags: { contains: '"' + v + '"' } }] }); }
    if (and.length) where.AND = and; }
  contains("orderId", "orderCode"); contains("city", "city"); contains("customer", "customerName");
  if (can(user, "orders.viewAll")) { const lo = sp.get("leadOwner"); if (lo === "0") where.leadOwnerId = null; else if (lo) where.leadOwnerId = Number(lo); }
  const range = (fromK: string, toK: string, f: string) => { const from = sp.get(fromK), to = sp.get(toK); if (from || to) where[f] = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) }; };
  range("orderFrom", "orderTo", "dateTime"); range("followFrom", "followTo", "followUpDate"); range("assignFrom", "assignTo", "agentAssignDate");
  if (sp.get("hideActivities") === "1" && !sp.get("source")) where.source = { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] };

  const grouped = await prisma.order.groupBy({ by: ["orderStatus"], where, _count: { _all: true } });
  const rawByStatus: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) { const c = row._count._all; rawByStatus[row.orderStatus || "Unknown"] = c; total += c; }

  const buckets: Record<string, number> = {};
  let mapped = 0;
  for (const [bucket, statuses] of Object.entries(BUCKET_MAP)) {
    const c = statuses.reduce((s, st) => s + (rawByStatus[st] || 0), 0);
    buckets[bucket] = c; mapped += c;
  }
  const other = total - mapped;
  if (other > 0) buckets["Other"] = other;

  const newCount = buckets["New"] || 0;
  const assigned = total;
  const untouched = newCount;
  const worked = assigned - newCount;

  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const _day = istNow.toISOString().slice(0, 10);
  const todayStart = new Date(_day + "T00:00:00.000+05:30");
  const todayEnd = new Date(_day + "T23:59:59.999+05:30");
  const tomStart = new Date(todayStart.getTime() + 86400000);
  const tomEnd = new Date(todayEnd.getTime() + 86400000);
  const TERMINAL = TERMINAL_STATUSES;
  const [overdue, actionRequired, tomorrow] = await Promise.all([
    prisma.order.count({ where: { ...where, followUpDate: { not: null, lt: todayStart }, orderStatus: { notIn: TERMINAL } } }),
    prisma.order.count({ where: { ...where, OR: [ { orderStatus: "New" }, { followUpDate: { lte: todayEnd }, orderStatus: { notIn: TERMINAL } } ] } }),
    prisma.order.count({ where: { ...where, followUpDate: { gte: tomStart, lte: tomEnd }, orderStatus: { notIn: TERMINAL } } }),
  ]);

  return ok({ buckets, byStatus: rawByStatus, assigned, worked, untouched, overdue, actionRequired, tomorrow, total });
}