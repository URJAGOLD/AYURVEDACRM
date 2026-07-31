import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { REVENUE_STATUSES } from "@/lib/statuses";

export const runtime = "nodejs";

const CONFIRMED_SET = REVENUE_STATUSES;
const CANCELLED_SET = ["Confirm cancel", "Cancel pending", "Final cancel", "Cancelled", "Dealer Cancel"];
const DELIVERED_SET = ["Delivered", "GPO Delivered"];
const PENDING_SET = ["New", "Confirm Pending", "Pending", "GPO Pending"];

function shipBucket(o: any): string {
  const s = String(o.trackingStage || o.shippingStatus || o.orderStatus || "").toUpperCase();
  if (s.includes("RTO")) return "RTO";
  if (s.includes("CANCEL")) return "Cancelled";
  if (s.includes("DELIVERED")) return "Delivered";
  if (s.includes("OUT FOR DELIVERY")) return "Out For Delivery";
  if (s.includes("TRANSIT") || s.includes("SHIPPED") || s.includes("DISPATCH") || s.includes("PICKED")) return "In Transit";
  if (s.includes("PICKUP")) return "Pickup Scheduled";
  return "Booked";
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "reports.view");
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const source = sp.get("source") || "";

  const where: any = { isDeleted: false };
  if (from || to) {
    where.dateTime = {};
    if (from) where.dateTime.gte = new Date(from + "T00:00:00.000+05:30");
    if (to) where.dateTime.lte = new Date(to + "T23:59:59.999+05:30");
  }
  if (source) where.source = source; else where.source = { notIn: ["Discount Lead", "WhatsApp", "Abandoned Cart"] };

  const [byStatus, bySource, byAgent, byDealer, byState, deliveredRows, users, dealers, statesMaster] = await Promise.all([
    prisma.order.groupBy({ by: ["orderStatus"], where, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["source", "orderStatus"], where, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["leadOwnerId", "orderStatus"], where, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["dealerId", "orderStatus"], where, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["stateId", "orderStatus"], where, _count: { _all: true } }),
    prisma.order.findMany({ where: { ...where, orderStatus: { in: DELIVERED_SET } }, select: { source: true, leadOwnerId: true, dealerId: true, stateId: true, price: true, quantity: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.dealer.findMany({ select: { id: true, name: true } }),
    prisma.state.findMany({ select: { id: true, name: true } }),
  ]);

  const userName: Record<number, string> = {};
  (users as any[]).forEach((u) => { userName[u.id] = u.name; });
  const dealerName: Record<number, string> = {};
  (dealers as any[]).forEach((d) => { dealerName[d.id] = d.name; });

  let total = 0;
  (byStatus as any[]).forEach((r) => { total += r._count._all; });
  const statusBreakdown = (byStatus as any[])
    .map((r) => ({ status: r.orderStatus, count: r._count._all, pct: total ? Math.round((r._count._all / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  const sumIn = (set: string[]) => (byStatus as any[]).filter((r) => set.includes(r.orderStatus)).reduce((s, r) => s + r._count._all, 0);
  const confirmedAll = sumIn(CONFIRMED_SET);
  const delivered = sumIn(DELIVERED_SET);
  const cancelled = sumIn(CANCELLED_SET);
  const pending = sumIn(PENDING_SET);
  const confirmedExact = (byStatus as any[]).filter((r) => r.orderStatus === "Confirmed").reduce((s, r) => s + r._count._all, 0);
  const callback = (byStatus as any[]).filter((r) => r.orderStatus === "Callback").reduce((s, r) => s + r._count._all, 0);

  let revenue = 0;
  const revBySource: Record<string, number> = {};
  const revByAgent: Record<string, number> = {};
  const revByDealer: Record<string, number> = {};
  (deliveredRows as any[]).forEach((o) => {
    const amt = Number(o.price) * (o.quantity || 1);
    revenue += amt;
    const sk = o.source || "(none)";
    revBySource[sk] = (revBySource[sk] || 0) + amt;
    const ak = o.leadOwnerId == null ? "0" : String(o.leadOwnerId);
    revByAgent[ak] = (revByAgent[ak] || 0) + amt;
    const dk = o.dealerId == null ? "0" : String(o.dealerId);
    revByDealer[dk] = (revByDealer[dk] || 0) + amt;
  });

  const srcAgg: Record<string, any> = {};
  (bySource as any[]).forEach((r) => {
    const sk = r.source || "(none)";
    if (!srcAgg[sk]) srcAgg[sk] = { source: sk, total: 0, confirmed: 0, delivered: 0, revenue: 0 };
    srcAgg[sk].total += r._count._all;
    if (CONFIRMED_SET.includes(r.orderStatus)) srcAgg[sk].confirmed += r._count._all;
    if (DELIVERED_SET.includes(r.orderStatus)) srcAgg[sk].delivered += r._count._all;
  });
  Object.keys(srcAgg).forEach((sk) => { srcAgg[sk].revenue = Math.round(revBySource[sk] || 0); });
  const sourceBreakdown = Object.values(srcAgg).sort((a: any, b: any) => b.total - a.total);

  const agAgg: Record<string, any> = {};
  (byAgent as any[]).forEach((r) => {
    const key = r.leadOwnerId == null ? "0" : String(r.leadOwnerId);
    if (!agAgg[key]) agAgg[key] = { agent: key === "0" ? "Unassigned" : (userName[Number(key)] || ("User " + key)), total: 0, confirmed: 0, delivered: 0, cancelled: 0, callback: 0, revenue: 0, conversion: 0 };
    const c = r._count._all;
    agAgg[key].total += c;
    if (CONFIRMED_SET.includes(r.orderStatus)) agAgg[key].confirmed += c;
    if (DELIVERED_SET.includes(r.orderStatus)) agAgg[key].delivered += c;
    if (CANCELLED_SET.includes(r.orderStatus)) agAgg[key].cancelled += c;
    if (r.orderStatus === "Callback") agAgg[key].callback += c;
  });
  Object.keys(agAgg).forEach((k) => {
    agAgg[k].revenue = Math.round(revByAgent[k] || 0);
    agAgg[k].conversion = agAgg[k].total ? Math.round((agAgg[k].confirmed / agAgg[k].total) * 1000) / 10 : 0;
  });
  const agentPerformance = Object.values(agAgg).sort((a: any, b: any) => b.total - a.total);

  const dlAgg: Record<string, any> = {};
  (byDealer as any[]).forEach((r) => {
    const key = r.dealerId == null ? "0" : String(r.dealerId);
    if (!dlAgg[key]) dlAgg[key] = { dealer: key === "0" ? "Unassigned" : (dealerName[Number(key)] || ("Dealer " + key)), total: 0, delivered: 0, revenue: 0 };
    const c = r._count._all;
    dlAgg[key].total += c;
    if (DELIVERED_SET.includes(r.orderStatus)) dlAgg[key].delivered += c;
  });
  Object.keys(dlAgg).forEach((k) => { dlAgg[k].revenue = Math.round(revByDealer[k] || 0); });
  const dealerCumulative = Object.values(dlAgg).sort((a: any, b: any) => b.total - a.total);

  const conversionRate = total ? Math.round((confirmedAll / total) * 1000) / 10 : 0;

  const stName: Record<number, string> = {};
  (statesMaster as any[]).forEach((s) => { stName[s.id] = s.name; });
  const revByState: Record<string, number> = {};
  (deliveredRows as any[]).forEach((o) => { if (o.stateId != null) { revByState[String(o.stateId)] = (revByState[String(o.stateId)] || 0) + Number(o.price) * (o.quantity || 1); } });
  const stAgg: Record<string, any> = {};
  (byState as any[]).forEach((r) => { if (r.stateId == null) return; const key = String(r.stateId); if (!stAgg[key]) stAgg[key] = { state: stName[r.stateId] || ("State " + key), total: 0, confirmed: 0, revenue: 0 }; stAgg[key].total += r._count._all; if (CONFIRMED_SET.includes(r.orderStatus)) stAgg[key].confirmed += r._count._all; });
  Object.keys(stAgg).forEach((k) => { stAgg[k].revenue = Math.round(revByState[k] || 0); });
  const stateBreakdown = Object.values(stAgg).sort((a: any, b: any) => b.total - a.total);

  const shipRows = await prisma.order.findMany({ where: { ...where, awbCode: { not: null } }, select: { trackingStage: true, shippingStatus: true, orderStatus: true, courierName: true } });
  const notBooked = await prisma.order.count({ where: { ...where, awbCode: null } });
  const shipAgg: Record<string, number> = {};
  const courierAgg: Record<string, any> = {};
  let bookedTotal = 0;
  (shipRows as any[]).forEach((o) => {
    bookedTotal++;
    const b = shipBucket(o);
    shipAgg[b] = (shipAgg[b] || 0) + 1;
    const c = o.courierName || "(unknown)";
    if (!courierAgg[c]) courierAgg[c] = { courier: c, total: 0, delivered: 0 };
    courierAgg[c].total++;
    if (b === "Delivered") courierAgg[c].delivered++;
  });
  const shipmentBreakdown = Object.keys(shipAgg).map((k) => ({ status: k, count: shipAgg[k], pct: bookedTotal ? Math.round((shipAgg[k] / bookedTotal) * 1000) / 10 : 0 })).sort((a, b) => b.count - a.count);
  const courierSplit = Object.values(courierAgg).map((c: any) => ({ ...c, deliveredPct: c.total ? Math.round((c.delivered / c.total) * 1000) / 10 : 0 })).sort((a: any, b: any) => b.total - a.total);
  const shipmentSummary = { booked: bookedTotal, notBooked, inTransit: (shipAgg["In Transit"] || 0) + (shipAgg["Out For Delivery"] || 0), delivered: shipAgg["Delivered"] || 0, rto: shipAgg["RTO"] || 0, cancelled: shipAgg["Cancelled"] || 0 };

  // ---- Agent Detail: Untouched, Worked, Followups, Activity breakdown ----
  const today = new Date(Date.now() + 5.5 * 3600 * 1000);
  const todayDateStr = today.toISOString().slice(0, 10);
  const todayStart = new Date(todayDateStr + "T00:00:00.000+05:30");
  const todayEnd = new Date(todayDateStr + "T23:59:59.999+05:30");

  // Orders assigned to each agent in the selected date range
  const assignedOrders = await prisma.order.findMany({
    where: { ...where, leadOwnerId: { not: null }, isDeleted: false },
    select: { id: true, leadOwnerId: true, orderStatus: true, followUpDate: true, agentAssignDate: true, totalAmount: true, price: true, quantity: true },
  });

  // OrderHistory in date range (human actions only — addedById not null, skip [Sync] entries)
  const histWhere: any = { addedById: { not: null } };
  if (from || to) { histWhere.createdAt = {}; if (from) histWhere.createdAt.gte = new Date(from + "T00:00:00.000+05:30"); if (to) histWhere.createdAt.lte = new Date(to + "T23:59:59.999+05:30"); }
  const histRows = await prisma.orderHistory.findMany({
    where: { ...histWhere, NOT: { status: { startsWith: "[Sync]" } } },
    select: { orderId: true, addedById: true, status: true, createdAt: true },
  });

  // Followups due in range (overdue = past, today, upcoming)
  const fuWhere: any = { leadOwnerId: { not: null }, followUpDate: { not: null }, isDeleted: false };
  const fuOrders = await prisma.order.findMany({ where: fuWhere, select: { id: true, leadOwnerId: true, followUpDate: true, orderStatus: true } });

  // Build worked-order sets per agent
  const workedByAgent: Record<number, Set<number>> = {};
  const histByAgent: Record<number, { status: string; createdAt: Date }[]> = {};
  histRows.forEach((h: any) => {
    if (!h.addedById) return;
    if (!workedByAgent[h.addedById]) workedByAgent[h.addedById] = new Set();
    workedByAgent[h.addedById].add(h.orderId);
    if (!histByAgent[h.addedById]) histByAgent[h.addedById] = [];
    histByAgent[h.addedById].push({ status: h.status, createdAt: h.createdAt });
  });

  // Status groups for activity breakdown
  const CONFIRMED_S = REVENUE_STATUSES;
  const CANCEL_S = ["Cancelled","Confirm cancel","Cancel pending","Final cancel","Dealer Cancel"];
  const GPO_S = ["GPO","GPO Pending","GPO Done","GPO Delivered"];

  // Build per-agent detail
  const agDetailMap: Record<number, any> = {};
  assignedOrders.forEach((o: any) => {
    const uid = o.leadOwnerId as number;
    if (!agDetailMap[uid]) agDetailMap[uid] = { agentId: uid, agent: userName[uid] || ("User " + uid), assigned: 0, worked: 0, untouched: 0, confirmed: 0, delivered: 0, cancelled: 0, callback: 0, pending: 0, gpoDone: 0, rto: 0, other: 0, revenue: 0 };
    agDetailMap[uid].assigned++;
    const worked = workedByAgent[uid] && workedByAgent[uid].has(o.id);
    if (worked) agDetailMap[uid].worked++;
    else agDetailMap[uid].untouched++;
    if (CONFIRMED_S.includes(o.orderStatus)) { agDetailMap[uid].confirmed++; const amt = o.totalAmount != null ? Number(o.totalAmount) : Number(o.price) * (o.quantity || 1); agDetailMap[uid].revenue += amt; }
    if (DELIVERED_SET.includes(o.orderStatus)) agDetailMap[uid].delivered++;
    if (CANCEL_S.includes(o.orderStatus)) agDetailMap[uid].cancelled++;
    if (o.orderStatus === "Callback") agDetailMap[uid].callback++;
    if (o.orderStatus === "Pending" || o.orderStatus === "GPO Pending") agDetailMap[uid].pending++;
    if (GPO_S.includes(o.orderStatus)) agDetailMap[uid].gpoDone++;
    if (o.orderStatus === "RTO") agDetailMap[uid].rto++;
  });

  // Add activity breakdown from history
  histByAgent && Object.keys(histByAgent).forEach((k) => {
    const uid = Number(k);
    if (!agDetailMap[uid]) agDetailMap[uid] = { agentId: uid, agent: userName[uid] || ("User " + uid), assigned: 0, worked: 0, untouched: 0, confirmed: 0, delivered: 0, cancelled: 0, callback: 0, pending: 0, gpoDone: 0, rto: 0, other: 0, revenue: 0 };
    const actions: Record<string, number> = {};
    histByAgent[uid].forEach((h) => { actions[h.status] = (actions[h.status] || 0) + 1; });
    agDetailMap[uid].activityBreakdown = actions;
    agDetailMap[uid].totalActions = Object.values(actions).reduce((a: number, b) => a + (b as number), 0);
  });

  // Followup stats per agent (all time, not date-range filtered so overdue is always current)
  const nowTs = Date.now();
  const todayTs = todayEnd.getTime();
  fuOrders.forEach((o: any) => {
    const uid = o.leadOwnerId as number;
    if (!agDetailMap[uid]) agDetailMap[uid] = { agentId: uid, agent: userName[uid] || ("User " + uid), assigned: 0, worked: 0, untouched: 0, confirmed: 0, delivered: 0, cancelled: 0, callback: 0, pending: 0, gpoDone: 0, rto: 0, other: 0, revenue: 0 };
    if (!agDetailMap[uid].fuOverdue) { agDetailMap[uid].fuOverdue = 0; agDetailMap[uid].fuToday = 0; agDetailMap[uid].fuUpcoming = 0; agDetailMap[uid].fuMissed = 0; }
    const fuTs = new Date(o.followUpDate).getTime();
    if (fuTs < todayStart.getTime()) { agDetailMap[uid].fuOverdue++; }
    else if (fuTs <= todayTs) { agDetailMap[uid].fuToday++; }
    else { agDetailMap[uid].fuUpcoming++; }
  });

  const agentDetail = Object.values(agDetailMap).map((a: any) => ({
    ...a,
    workedPct: a.assigned ? Math.round((a.worked / a.assigned) * 100) : 0,
    revenue: Math.round(a.revenue || 0),
    conversion: a.assigned ? Math.round(((a.confirmed) / a.assigned) * 1000) / 10 : 0,
    fuOverdue: a.fuOverdue || 0, fuToday: a.fuToday || 0, fuUpcoming: a.fuUpcoming || 0, fuMissed: a.fuMissed || 0,
    activityBreakdown: a.activityBreakdown || {},
    totalActions: a.totalActions || 0,
    alert: a.untouched > 20 ? "red" : (a.fuOverdue > 5 || a.fuMissed > 3) ? "red" : a.workedPct < 30 ? "yellow" : "green",
  })).sort((a: any, b: any) => b.assigned - a.assigned);

  const agentSummary = {
    totalAssigned: agentDetail.reduce((s: number, a: any) => s + a.assigned, 0),
    totalWorked: agentDetail.reduce((s: number, a: any) => s + a.worked, 0),
    totalUntouched: agentDetail.reduce((s: number, a: any) => s + a.untouched, 0),
    totalOverdue: agentDetail.reduce((s: number, a: any) => s + a.fuOverdue, 0),
    totalToday: agentDetail.reduce((s: number, a: any) => s + a.fuToday, 0),
    totalConfirmed: agentDetail.reduce((s: number, a: any) => s + a.confirmed, 0),
  };

  return ok({
    summary: { total, confirmed: confirmedExact, confirmedAll, delivered, cancelled, pending, callback, revenue: Math.round(revenue), conversionRate },
    statusBreakdown, sourceBreakdown, agentPerformance, agentDetail, agentSummary, dealerCumulative, stateBreakdown,
    shipmentSummary, shipmentBreakdown, courierSplit,
  });
}