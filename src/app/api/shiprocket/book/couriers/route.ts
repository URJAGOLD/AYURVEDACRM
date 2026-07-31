import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { getCourierOptions, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

const DELIVERED = ["Delivered", "GPO Delivered"];
const RTO_SET = ["RTO"];
const num = (v: any, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// GET ?orderId= -> enterprise shipping intelligence (real charges + derived scores + our pincode history)
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.book");
  if (g instanceof Response) return g;
  const orderId = Number(req.nextUrl.searchParams.get("orderId"));
  if (!orderId) return bad("orderId required");
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) return bad("Order not found", 404);
  if (!order.pincode) return bad("Order has no pincode");
  const cod = order.paymentStatus === "Completed" ? 0 : 1;
  const weight = num(process.env.DEFAULT_PACKAGE_WEIGHT, 0.5) * (order.quantity || 1);

  // Pincode intelligence from OUR own CRM order history (real; grows over time)
  let pincode: any = { pin: order.pincode, sample: 0, decided: 0, successPct: null, rtoPct: null, risk: "insufficient" };
  try {
    const hist = await prisma.order.findMany({ where: { pincode: order.pincode, isDeleted: false }, select: { orderStatus: true } });
    const delivered = hist.filter((h) => DELIVERED.includes(h.orderStatus)).length;
    const rto = hist.filter((h) => RTO_SET.includes(h.orderStatus)).length;
    const decided = delivered + rto;
    const successPct = decided ? Math.round((100 * delivered) / decided) : null;
    const rtoPct = decided ? Math.round((100 * rto) / decided) : null;
    const risk = decided < 5 ? "insufficient" : (rtoPct as number) >= 25 ? "High" : (rtoPct as number) >= 10 ? "Medium" : "Low";
    pincode = { pin: order.pincode, sample: hist.length, decided, delivered, rto, successPct, rtoPct, risk };
  } catch {}

  let raw: any;
  try { raw = await getCourierOptions(order.pincode, { weight, cod: cod as 0 | 1 }); }
  catch (e) { return bad("Couriers fetch failed: " + shiprocketError(e), 502); }

  const recommendedId = raw.recommendedId ?? null;
  const list = (raw.couriers || []).map((c: any) => {
    const surge = Array.isArray(c.surge) ? c.surge.reduce((s: number, x: any) => s + num(x.charge), 0) : 0;
    return {
      id: c.courier_company_id, name: c.courier_name,
      available: !c.blocked && !c.odablock,
      mode: c.is_surface ? "Surface" : "Air",
      cost: num(c.rate),
      charges: { freight: num(c.freight_charge), cod: num(c.cod_charges), rto: num(c.rto_charges), other: num(c.other_charges) + num(c.coverage_charges) + num(c.entry_tax), surge: Math.round(surge * 100) / 100 },
      days: num(c.estimated_delivery_days), etd: c.etd || "", etdHours: num(c.etd_hours),
      pickupCutoff: c.cutoff_time || "", pickupPerf: num(c.pickup_performance),
      rating: num(c.rating),
      perf: { delivery: num(c.delivery_performance), rto: num(c.rto_performance), tracking: num(c.tracking_performance), sla: num(c.SLA_Adherence), ndr: num(c.NDR_Reattempt) },
      cod: !!c.cod,
      weight: { charge: num(c.charge_weight), min: num(c.min_weight), volumetric: num(c.volumetric_max_weight) },
      realtimeTracking: c.realtime_tracking || "-", pod: c.pod_available || "-", callBefore: c.call_before_delivery || "-",
      assured: num(c.assured_amount),
      recommended: c.courier_company_id === recommendedId,
      decision: { cost: 0, delivery: 0, reliability: 0, overall: 0 },
    };
  });

  if (list.length) {
    const costs = list.map((x: any) => x.cost), days = list.map((x: any) => x.days);
    const cMin = Math.min(...costs), cMax = Math.max(...costs), dMin = Math.min(...days), dMax = Math.max(...days);
    const norm = (v: number, lo: number, hi: number, invert = false) => { if (hi === lo) return 100; const t = (v - lo) / (hi - lo); return Math.round((invert ? 1 - t : t) * 100); };
    list.forEach((x: any) => {
      const costScore = norm(x.cost, cMin, cMax, true);
      const deliveryScore = dMax === dMin ? Math.round((x.perf.delivery / 5) * 100) : norm(x.days, dMin, dMax, true);
      const rel = [x.perf.delivery, x.perf.rto, x.rating, x.perf.sla, x.perf.tracking].filter((n: number) => n > 0);
      const reliabilityScore = rel.length ? Math.round((rel.reduce((s: number, n: number) => s + n, 0) / (rel.length * 5)) * 100) : 0;
      x.decision = { cost: costScore, delivery: deliveryScore, reliability: reliabilityScore, overall: Math.round(0.35 * deliveryScore + 0.30 * reliabilityScore + 0.35 * costScore) };
    });
  }

  const best = (key: (x: any) => number, max = true) => list.length ? list.reduce((bb: any, x: any) => ((max ? key(x) > key(bb) : key(x) < key(bb)) ? x : bb)).id : null;
  const badges = {
    cheapest: best((x) => x.cost, false),
    fastest: best((x) => x.days, false),
    bestSuccess: best((x) => x.perf.delivery),
    lowestRto: best((x) => x.perf.rto),
    bestValue: best((x) => x.decision.overall),
  };

  return ok({ couriers: list, recommendedId, recommendedBy: raw.recommendedBy, pincode, badges, codMode: cod === 1 });
}