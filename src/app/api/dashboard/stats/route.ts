import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can, scopeFilter } from "@/lib/permissions";
import { REVENUE_STATUSES } from "@/lib/statuses";

export const runtime = "nodejs";

const CONFIRMED_SET = REVENUE_STATUSES;
const DELIVERED_SET = ["Delivered","GPO Delivered"];
const DISPATCHED_SET = ["In Transit","Dispatched","GPO Done"];
const CANCELLED_SET = ["Confirm cancel","Cancel pending","Final cancel","Cancelled","Dealer Cancel","RTO"];
const PENDING_SET = ["New","Confirm Pending","Pending","GPO Pending","Callback"];
const CLOSED = ["Confirmed","In Transit","Dispatched","Packed","Delivered","GPO Done","GPO Delivered","Confirm cancel","Cancel pending","Final cancel","Cancelled","Dealer Cancel","RTO"];

const istDateStr = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
const istStart = (s: string) => new Date(s + "T00:00:00.000+05:30");
const istEnd = (s: string) => new Date(s + "T23:59:59.999+05:30");
const num = (v: any) => Number(v) || 0;

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const scoped = !can(user, "orders.viewAll");
  const sp = req.nextUrl.searchParams;

  const todayStr = istDateStr(new Date());
  const from = sp.get("from") || todayStr;
  const to = sp.get("to") || todayStr;
  const gte = istStart(from), lte = istEnd(to);

  // dateBasis_toggle_4B
  const dateBasis = sp.get("dateBasis") || "order"; // "order" | "status"

  const base: any = { isDeleted: false, source: { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] } };
  if (scoped) Object.assign(base, scopeFilter(user));

  // For status-date mode: find orders whose status changed in [gte,lte]
  let statusBasisIds: number[] | undefined;
  if (dateBasis === "status") {
    const acts = await prisma.orderStatusActivity.findMany({
      where: { changedAt: { gte, lte }, order: { isDeleted: false, source: { notIn: ["Discount Lead","WhatsApp","Abandoned Cart"] } } },
      select: { orderId: true }, distinct: ["orderId"],
    });
    statusBasisIds = acts.map((a: any) => a.orderId);
  }

  const rowWhere = dateBasis === "status"
    ? { ...base, id: { in: statusBasisIds! } }
    : { ...base, dateTime: { gte, lte } };

  const rows = await prisma.order.findMany({
    where: rowWhere,
    select: {
      id: true, orderCode: true, customerName: true, contactNumber: true, city: true, orderStatus: true,
      paymentStatus: true, paymentMode: true, source: true, productName: true, dateTime: true,
      price: true, quantity: true, totalAmount: true, onlinePaid: true,
      state: { select: { name: true } }, leadOwner: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
  });

  const totalOf = (o: any) => (o.totalAmount != null ? num(o.totalAmount) : num(o.price) * (o.quantity || 1));

  let revenue = 0, online = 0, codPending = 0;
  const byStatus: Record<string, number> = {}, bySource: Record<string, number> = {}, byProduct: Record<string, number> = {}, byState: Record<string, number> = {}, byPayMode: Record<string, number> = {};
  const daily: Record<string, { orders: number; revenue: number }> = {};
  const lo: Record<string, { name: string; orders: number; confirmed: number; revenue: number }> = {};
  const phones = new Set<string>();

  for (const o of rows as any[]) {
    const tot = totalOf(o); const onl = num(o.onlinePaid);
    revenue += tot; online += onl;
    if (o.paymentStatus !== "Completed") codPending += Math.max(0, tot - onl);
    byStatus[o.orderStatus] = (byStatus[o.orderStatus] || 0) + 1;
    const src = o.source || "Other"; bySource[src] = (bySource[src] || 0) + 1;
    const pr = o.productName || "Other"; byProduct[pr] = (byProduct[pr] || 0) + 1;
    const stn = o.state?.name || "Unknown"; byState[stn] = (byState[stn] || 0) + 1;
    const pm = o.paymentMode || "COD"; byPayMode[pm] = (byPayMode[pm] || 0) + 1;
    const dstr = istDateStr(new Date(o.dateTime));
    if (!daily[dstr]) daily[dstr] = { orders: 0, revenue: 0 };
    daily[dstr].orders++; daily[dstr].revenue += tot;
    const key = o.leadOwner?.id ? String(o.leadOwner.id) : "0";
    if (!lo[key]) lo[key] = { name: o.leadOwner?.name || "Unassigned", orders: 0, confirmed: 0, revenue: 0 };
    lo[key].orders++; if (CONFIRMED_SET.includes(o.orderStatus)) lo[key].confirmed++; lo[key].revenue += tot;
    if (o.contactNumber) phones.add(o.contactNumber);
  }

  const sumSet = (set: string[]) => set.reduce((a, s) => a + (byStatus[s] || 0), 0);

  let repeatCust = 0, newCust = 0;
  if (phones.size) {
    const prior = await prisma.order.groupBy({ by: ["contactNumber"], where: { ...base, contactNumber: { in: Array.from(phones) }, dateTime: { lt: gte } }, _count: { _all: true } });
    const repeatSet = new Set(prior.map((p: any) => p.contactNumber));
    repeatCust = repeatSet.size;
    newCust = phones.size - repeatCust;
  }

  const tStart = istStart(todayStr), tEnd = istEnd(todayStr);
  const tomStr = istDateStr(new Date(tStart.getTime() + 86400000));
  const tmStart = istStart(tomStr), tmEnd = istEnd(tomStr);
  const [followToday, overdue, followTomorrow, followList] = await Promise.all([
    prisma.order.count({ where: { ...base, followUpDate: { gte: tStart, lte: tEnd }, orderStatus: { notIn: CLOSED } } }),
    prisma.order.count({ where: { ...base, followUpDate: { lt: tStart }, orderStatus: { notIn: CLOSED } } }),
    prisma.order.count({ where: { ...base, followUpDate: { gte: tmStart, lte: tmEnd }, orderStatus: { notIn: CLOSED } } }),
    prisma.order.findMany({ where: { ...base, followUpDate: { gte: tStart, lte: tEnd }, orderStatus: { notIn: CLOSED } }, orderBy: { followUpDate: "asc" }, take: 15, select: { id: true, orderCode: true, customerName: true, contactNumber: true, city: true, orderStatus: true, followUpDate: true } }),
  ]);

  const topN = (obj: Record<string, number>, n: number) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ label: k, value: v }));
  const dailyArr = Object.entries(daily).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ date: d, orders: v.orders, revenue: Math.round(v.revenue) }));
  const loArr = Object.values(lo).sort((a, b) => b.orders - a.orders);

  // previous equal-length window for trend comparison
  const _dayMs = 86400000;
  const _lenDays = Math.max(1, Math.round((lte.getTime() - gte.getTime()) / _dayMs));
  const _pToStr = istDateStr(new Date(gte.getTime() - _dayMs));
  const _pFromStr = istDateStr(new Date(istStart(_pToStr).getTime() - (_lenDays - 1) * _dayMs));
  const _pGte = istStart(_pFromStr), _pLte = istEnd(_pToStr);
  const prevRows = await prisma.order.findMany({ where: { ...base, dateTime: { gte: _pGte, lte: _pLte } }, select: { orderStatus: true, paymentStatus: true, price: true, quantity: true, totalAmount: true, onlinePaid: true } });
  let _pRev = 0, _pOnline = 0, _pCod = 0; const _pByStatus: Record<string, number> = {};
  for (const o of prevRows as any[]) {
    const tot = (o.totalAmount != null ? num(o.totalAmount) : num(o.price) * (o.quantity || 1));
    const onl = num(o.onlinePaid);
    _pRev += tot; _pOnline += onl;
    if (o.paymentStatus !== "Completed") _pCod += Math.max(0, tot - onl);
    _pByStatus[o.orderStatus] = (_pByStatus[o.orderStatus] || 0) + 1;
  }
  const _pSum = (set: string[]) => set.reduce((a, s) => a + (_pByStatus[s] || 0), 0);
  const prevKpi = { orders: prevRows.length, revenue: Math.round(_pRev), online: Math.round(_pOnline), codPending: Math.round(_pCod), confirmed: _pSum(CONFIRMED_SET), delivered: _pSum(DELIVERED_SET), dispatched: _pSum(DISPATCHED_SET), cancelled: _pSum(CANCELLED_SET), pending: _pSum(PENDING_SET) };

  return ok({
    range: { from, to, today: todayStr },
    scope: scoped ? "own" : "all",
    kpi: {
      orders: rows.length, revenue: Math.round(revenue), online: Math.round(online), codPending: Math.round(codPending),
      confirmed: sumSet(CONFIRMED_SET), delivered: sumSet(DELIVERED_SET), dispatched: sumSet(DISPATCHED_SET),
      cancelled: sumSet(CANCELLED_SET), pending: sumSet(PENDING_SET), newCust, repeatCust, followToday, overdue, followTomorrow,
    },
    prevKpi,
    byStatus,
    payment: { online: Math.round(online), codPending: Math.round(codPending), modes: byPayMode },
    source: topN(bySource, 8),
    products: topN(byProduct, 6),
    states: topN(byState, 8),
    daily: dailyArr,
    leadOwners: loArr,
    followList,
    liveFeed: (rows as any[]).slice(0, 8).map((o) => ({ id: o.id, orderCode: o.orderCode, customerName: o.customerName, contactNumber: o.contactNumber, status: o.orderStatus, total: totalOf(o), source: o.source, dateTime: o.dateTime })),
  });
}