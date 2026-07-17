"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

type Courier = {
  id: number; name: string; available: boolean; mode: string; cost: number;
  charges: { freight: number; cod: number; rto: number; other: number; surge: number };
  days: number; etd: string; etdHours: number; pickupCutoff: string; pickupPerf: number;
  rating: number; perf: { delivery: number; rto: number; tracking: number; sla: number; ndr: number };
  cod: boolean; weight: { charge: number; min: number; volumetric: number };
  realtimeTracking: string; pod: string; callBefore: string; assured: number; recommended: boolean;
  decision: { cost: number; delivery: number; reliability: number; overall: number };
};
type Resp = { couriers: Courier[]; recommendedId: number | null; recommendedBy: any; pincode: any; badges: any; codMode: boolean };

const inr = (n: number) => "\u20B9" + (Math.round((Number(n) || 0) * 100) / 100);
const STAR = "\u2605";

export default function CourierSelectModal({ order, onClose, onConfirm }: { order: any; onClose: () => void; onConfirm: (courierId?: number) => void; }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [d, setD] = useState<Resp | null>(null);
  const [picked, setPicked] = useState<number | "auto">("auto");
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    api.get("/api/shiprocket/book/couriers?orderId=" + order.id)
      .then((r: any) => { if (alive) setD(r); })
      .catch((e: any) => { if (alive) setErr(e?.message || "Couriers fetch failed"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [order.id]);

  const couriers = d?.couriers || [];
  const nameOf = (id: number | null) => couriers.find((c) => c.id === id)?.name || "-";
  const b = d?.badges || {};
  const p = d?.pincode || {};
  function confirm() { setBooking(true); onConfirm(picked === "auto" ? undefined : Number(picked)); }

  const riskColor = p.risk === "High" ? "text-red-600 bg-red-50" : p.risk === "Medium" ? "text-amber-600 bg-amber-50" : p.risk === "Low" ? "text-emerald-600 bg-emerald-50" : "text-gray-500 bg-gray-100";
  const Bar = ({ v, c }: { v: number; c: string }) => (<div className="h-1.5 w-full rounded-full bg-gray-100"><div className={"h-1.5 rounded-full " + c} style={{ width: Math.max(3, Math.min(100, v)) + "%" }} /></div>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-gray-800">Shipping Intelligence - Book #{order.orderCode}</h3>
            <p className="text-xs text-gray-500">{order.customerName} - {order.city || "-"} - {order.pincode} - {order.paymentStatus === "Completed" ? "Prepaid" : "COD"}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? <div className="py-10 text-center text-sm text-gray-400">Shipping intelligence laa rahe hain...</div>
          : err ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}<div className="mt-1 text-xs text-gray-500">Account active + Test OK hona chahiye. Aap Auto se bhi book kar sakte hain.</div></div>
          : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[["Cheapest", b.cheapest], ["Fastest", b.fastest], ["Best Success", b.bestSuccess], ["Lowest RTO", b.lowestRto], ["Best Value", b.bestValue]].map(([lbl, id]: any) => (
                <div key={lbl} className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{lbl}</div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-gray-700" title={nameOf(id)}>{nameOf(id)}</div>
                </div>
              ))}
            </div>

            <div className="mb-3 rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pincode Intelligence - {p.pin}</div>
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + riskColor}>{p.risk === "insufficient" ? "Insufficient data" : p.risk + " Risk"}</span>
              </div>
              {p.risk === "insufficient"
                ? <div className="mt-1 text-xs text-gray-500">Aapke CRM me is pincode ke abhi {p.sample ?? 0} order(s). Reliable % ke liye aur delivered/RTO data chahiye - orders badhne par yeh khud accurate hoga.</div>
                : <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-sm font-bold text-emerald-600">{p.successPct}%</div><div className="text-[10px] text-gray-400">Delivery Success</div></div>
                    <div><div className="text-sm font-bold text-red-600">{p.rtoPct}%</div><div className="text-[10px] text-gray-400">RTO Rate</div></div>
                    <div><div className="text-sm font-bold text-gray-700">{p.decided}</div><div className="text-[10px] text-gray-400">Decided Orders</div></div>
                  </div>}
              <div className="mt-1 text-[10px] text-gray-400">* Aapke apne CRM order history se (Shiprocket pincode-level history API nahi deta).</div>
            </div>            <label className={"mb-2 flex cursor-pointer items-center gap-3 rounded-xl border p-3 " + (picked === "auto" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300")}>
              <input type="radio" name="cour" checked={picked === "auto"} onChange={() => setPicked("auto")} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">{"\u26A1"} Auto - Shiprocket recommended{d?.recommendedId ? " (" + nameOf(d.recommendedId) + ")" : ""}</div>
                <div className="text-xs text-gray-500">Shiprocket khud best courier choose karega</div>
              </div>
            </label>

            {couriers.length === 0 && <div className="py-4 text-center text-xs text-gray-400">Is pincode ke liye courier list nahi mili - Auto se book karein.</div>}

            <div className="space-y-2">
              {couriers.map((c) => {
                const badge = c.id === b.cheapest ? "Cheapest" : c.id === b.fastest ? "Fastest" : c.id === b.bestValue ? "Best Value" : c.id === b.lowestRto ? "Low RTO" : "";
                return (
                <label key={c.id} className={"block cursor-pointer rounded-xl border p-3 " + (picked === c.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300")}>
                  <div className="flex items-start gap-3">
                    <input type="radio" name="cour" className="mt-1" checked={picked === c.id} onChange={() => setPicked(c.id)} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-800">{c.name}</span>
                        <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + (c.mode === "Air" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-600")}>{c.mode}</span>
                        {c.recommended && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{STAR} Recommended</span>}
                        {badge && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{badge}</span>}
                        {!c.available && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Unavailable</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">{c.days || "?"} days - ETD {c.etd || "-"} - cutoff {c.pickupCutoff || "-"} - {c.cod ? "COD" : "Prepaid only"} - {STAR}{c.rating || "-"}</div>
                    </div>
                    <div className="text-right"><div className="text-base font-bold text-gray-800">{inr(c.cost)}</div><div className="text-[10px] text-gray-400">Score {c.decision.overall}/100</div></div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-gray-600 sm:grid-cols-4">
                    <span>Freight: <b>{inr(c.charges.freight)}</b></span>
                    <span>COD: <b>{inr(c.charges.cod)}</b></span>
                    <span>RTO: <b>{inr(c.charges.rto)}</b></span>
                    <span>Surge+Other: <b>{inr(c.charges.surge + c.charges.other)}</b></span>
                    <span>Wt slab: <b>{c.weight.charge || c.weight.min}kg</b></span>
                    <span>Volumetric: <b>{c.weight.volumetric || "-"}kg</b></span>
                    <span>Tracking: <b>{c.realtimeTracking}</b></span>
                    <span>POD: <b>{c.pod}</b></span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[["Delivery", c.decision.delivery, "bg-emerald-500"], ["Cost", c.decision.cost, "bg-blue-500"], ["Reliability", c.decision.reliability, "bg-violet-500"], ["Overall", c.decision.overall, "bg-amber-500"]].map(([l, v, col]: any) => (
                      <div key={l}><div className="flex justify-between text-[10px] text-gray-400"><span>{l}</span><span>{v}</span></div><Bar v={v} c={col} /></div>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[10px] text-gray-400">SR scores - Delivery {c.perf.delivery}/5 - RTO-safety {c.perf.rto}/5 - Tracking {c.perf.tracking}/5 - SLA {c.perf.sla}/5 - NDR-reattempt {c.perf.ndr}/5</div>
                </label>
              );})}
            </div>
            <p className="mt-3 text-[10px] text-gray-400">Charges/days/scores Shiprocket serviceability se live. Decision scores in metrics se derived. NDR/RTO true-% per-courier Shiprocket nahi deta - SR /5 score dikhaya gaya hai.</p>
          </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">Cancel</button>
          <button disabled={loading || booking} onClick={confirm} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{booking ? "Booking..." : "Book Order"}</button>
        </div>
      </div>
    </div>
  );
}