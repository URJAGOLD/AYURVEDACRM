import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { can, scopeFilter } from "@/lib/permissions";
import { buildOrderCode } from "@/lib/excel";
import { TERMINAL_STATUSES, REVENUE_STATUSES } from "@/lib/statuses";
import { getCrmSettings } from "@/lib/settings";

export const runtime = "nodejs";

// LIST + FILTER. Token-based (no userid in URL). DATA SCOPING: without orders.viewAll,
// the user only sees orders where leadOwnerId = their own id.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const limit = Math.min(50000, Math.max(1, Number(sp.get("limit") || 20)));
  const where: any = { isDeleted: false };
  Object.assign(where, scopeFilter(user));
  const { preferences } = await getCrmSettings();

  const eq = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = v; };
  const num = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = Number(v); };
  const contains = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = { contains: v, mode: "insensitive" }; };
  eq("status","orderStatus"); eq("payment","paymentStatus"); eq("pincode","pincode"); eq("product","productName");
  eq("paymentMode","paymentMode");
  { const v = sp.get("cod"); if (v === "1") where.onlinePaid = { lte: 0 }; }
  { const v = sp.get("onlinePaidOnly"); if (v === "1") where.onlinePaid = { gt: 0 }; }
  { const v = sp.get("highValue"); if (v === "1") where.totalAmount = { gte: preferences.highValueThreshold }; }
  { const v = sp.get("shipStatus"); if (v) { const arr = v.split(",").map((x) => x.trim()).filter(Boolean); if (arr.length) where.trackingStage = { in: arr }; } }
  { const v = sp.get("minValue"); if (v && Number(v) > 0) where.totalAmount = { gte: Number(v) }; }
  { const v = sp.get("statusIn"); if (v) { const arr = v.split(",").map((x) => x.trim()).filter(Boolean); if (arr.length) where.orderStatus = { in: arr }; } }
  { const v = sp.get("followDue"); if (v === "1") { const i = new Date(Date.now() + 5.5 * 3600 * 1000); const day = i.toISOString().slice(0, 10); where.followUpDate = { not: null, lte: new Date(day + "T23:59:59.999+05:30") }; } }
  num("stateId","stateId"); num("districtId","districtId"); num("dealerId","dealerId"); num("zm","zmId");
  { const and: any[] = [];
    { const v = sp.get("phone"); if (v) and.push({ OR: [{ contactNumber: { contains: v } }, { altMobile: { contains: v } }] }); }
    { const v = sp.get("source"); if (v) and.push({ OR: [{ source: v }, { sourceTags: { contains: '"' + v + '"' } }] }); }
    if (and.length) where.AND = and; } contains("orderId","orderCode"); contains("city","city"); contains("customer","customerName");
  if (can(user, "orders.viewAll")) {
    const lo = sp.get("leadOwner");
    if (lo === "0") where.leadOwnerId = null; else if (lo) where.leadOwnerId = Number(lo);
  }
  const range = (fromK: string, toK: string, f: string) => {
    const from = sp.get(fromK), to = sp.get(toK);
    if (from || to) where[f] = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) };
  };
  range("orderFrom","orderTo","dateTime"); range("followFrom","followTo","followUpDate"); range("assignFrom","assignTo","agentAssignDate");
  // Phase 4-B: Status-change date / status filter (uses OrderStatusActivity relation; additive AND).
  { const sf2 = sp.get("statusFrom"), st2 = sp.get("statusTo"), sStat = sp.get("statusChange");
    if (sf2 || st2 || sStat) {
      where.statusActivity = { some: {
        ...((sf2 || st2) ? { changedAt: { ...(sf2 ? { gte: new Date(sf2 + "T00:00:00.000+05:30") } : {}), ...(st2 ? { lte: new Date(st2 + "T23:59:59.999+05:30") } : {}) } } : {}),
        ...(sStat ? { newStatus: sStat } : {}),
      } };
    }
  }
  // DEDUP FIX: journey-activity rows (Discount Lead / WhatsApp / Abandoned Cart) ko Manage Orders list se hide karo.
  // Rows DB me bani rehti hain (customer-history timeline me dikhti hain). Explicit source filter ya withActivities=1 par dikhao.
  const ACTIVITY_SOURCES = ["Discount Lead", "WhatsApp", "Abandoned Cart"];
  if (sp.get("hideActivities") === "1" && !sp.get("source")) {
    where.source = { notIn: ACTIVITY_SOURCES };
  }

  // Phase 1: Work Queue presets (Action Required / Overdue / Tomorrow). IST-based.
  // Only applies when no explicit status/statusIn is set, so normal filters never conflict.
  const _queue = sp.get("queue");
  if (_queue && !sp.get("status") && !sp.get("statusIn")) {
    const TERMINAL = TERMINAL_STATUSES;
    const _i = new Date(Date.now() + 5.5 * 3600 * 1000);
    const _day = _i.toISOString().slice(0, 10);
    const _todayStart = new Date(_day + "T00:00:00.000+05:30");
    const _todayEnd = new Date(_day + "T23:59:59.999+05:30");
    const _tomStart = new Date(_todayStart.getTime() + 86400000);
    const _tomEnd = new Date(_todayEnd.getTime() + 86400000);
    if (_queue === "action") {
      where.OR = [
        { orderStatus: "New" },
        { followUpDate: { lte: _todayEnd }, orderStatus: { notIn: TERMINAL } }, // Action Required = today + overdue
      ];
    } else if (_queue === "overdue") {
      where.followUpDate = { not: null, lt: _todayStart };
      where.orderStatus = { notIn: TERMINAL };
    } else if (_queue === "tomorrow") {
      where.followUpDate = { gte: _tomStart, lte: _tomEnd };
      where.orderStatus = { notIn: TERMINAL };
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, skip: (page-1)*limit, take: limit, orderBy: { id: "desc" },
      include: { state: { select: { name:true } }, district: { select: { name:true } }, dealer: { select: { name:true } }, leadOwner: { select: { id:true, name:true } }, zoneManager: { select: { name:true } } } }),
    prisma.order.count({ where }),
  ]);
  const phones = Array.from(new Set(orders.map((o) => o.contactNumber).filter(Boolean)));
  if (phones.length) {
    const scope: any = { isDeleted: false, contactNumber: { in: phones } };
    Object.assign(scope, scopeFilter(user));
    const hist = await prisma.order.findMany({ where: scope, select: { contactNumber: true, orderStatus: true, price: true, quantity: true, totalAmount: true, source: true } });
    const CONF = REVENUE_STATUSES; const RISK = ["Cancelled", "Confirm cancel", "Cancel pending", "Final cancel", "Dealer Cancel", "RTO"]; const ACT = ["Discount Lead", "WhatsApp", "Abandoned Cart"]; const cmap: Record<string, { count: number; spent: number; risk: boolean }> = {};
    hist.forEach((h: any) => { const k = h.contactNumber; if (!k) return; if (ACT.includes(h.source)) return; if (!cmap[k]) cmap[k] = { count: 0, spent: 0, risk: false }; cmap[k].count += 1; const amt = h.totalAmount != null ? Number(h.totalAmount) : Number(h.price) * (h.quantity || 1); if (CONF.includes(h.orderStatus)) cmap[k].spent += amt; if (RISK.includes(h.orderStatus)) cmap[k].risk = true; });
    orders.forEach((o: any) => { const m = cmap[o.contactNumber]; o.sameCount = m ? m.count : 1; o.custSpent = m ? Math.round(m.spent) : 0; o.custRisk = m ? m.risk : false; });
  }
  // Phase 4-B: status-wise activity count for the selected status-change window (scoped).
  let statusActivitySummary: { status: string; count: number }[] | null = null;
  { const sf2 = sp.get("statusFrom"), st2 = sp.get("statusTo"), sStat = sp.get("statusChange");
    if (sf2 || st2) {
      const saWhere: any = {
        changedAt: { ...(sf2 ? { gte: new Date(sf2 + "T00:00:00.000+05:30") } : {}), ...(st2 ? { lte: new Date(st2 + "T23:59:59.999+05:30") } : {}) },
        order: { isDeleted: false, ...scopeFilter(user) },
        ...(sStat ? { newStatus: sStat } : {}),
      };
      const grp = await prisma.orderStatusActivity.groupBy({ by: ["newStatus"], where: saWhere, _count: { _all: true } });
      statusActivitySummary = grp.map((x: any) => ({ status: x.newStatus, count: x._count._all })).sort((a, b) => b.count - a.count);
    }
  }
  return ok({ orders, total, page, limit, totalPages: Math.ceil(total/limit), statusActivitySummary });
}

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.create");
  if (g instanceof Response) return g;
  const b = await req.json().catch(() => ({}));
  if (!b.customerName || !b.contactNumber || !b.productName) return bad("customerName, contactNumber, productName required");
  const phone = String(b.contactNumber).replace(/\D/g, "");
  if (!/^\d{10}$/.test(phone)) return bad("contactNumber must be 10 digits");
  const dup = await prisma.order.findFirst({
    where: { contactNumber: phone, isDeleted: false, dateTime: { gte: new Date(Date.now() - 30*864e5) } },
    select: { orderCode: true },
  });
  const maxRow = await prisma.order.aggregate({ _max: { id: true } });
  const nextSeq = (maxRow._max.id || 0) + 1;
  const order = await prisma.order.create({ data: {
    orderCode: buildOrderCode(349317 + nextSeq),
    customerName: b.customerName, contactNumber: phone, email: b.email || null,
    productName: b.productName, productSku: b.productSku || null,
    quantity: Number(b.quantity) || 1, price: Number(b.price) || 0,
    address: b.address || "", city: b.city || "",
    stateId: b.stateId ? Number(b.stateId) : null, districtId: b.districtId ? Number(b.districtId) : null,
    pincode: String(b.pincode || "111111").replace(/\D/g, "") || "111111",
    source: b.source || "Calling", sourceTags: b.source ? JSON.stringify([b.source]) : "[]", orderStatus: b.orderStatus || "New", paymentStatus: b.paymentStatus || "Pending",
    remark: b.remark || null, followUpDate: b.followUpDate ? new Date(b.followUpDate) : null,
    leadOwnerId: b.leadOwnerId ? Number(b.leadOwnerId) : null,
    altMobile: b.altMobile ? String(b.altMobile).replace(/\D/g, "").slice(-10) : null,
    totalAmount: (b.totalAmount === undefined || b.totalAmount === null || b.totalAmount === "") ? null : Number(b.totalAmount),
    onlinePaid: Number(b.onlinePaid) || 0,
    paymentMode: b.paymentMode || null,
  }});
  await prisma.orderHistory.create({ data: { orderId: order.id, status: order.orderStatus, remark: "Order created", addedById: g.user.id } });
  await audit(g.user.id, "order.create", "order", order.id);
  return ok({ order, duplicateWarning: dup ? "Phone already used on " + dup.orderCode : null }, 201);
}