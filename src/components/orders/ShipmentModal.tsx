"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/store/auth";

type TL = { date: string; status: string; activity: string; location: string };

export default function ShipmentModal({ order, onClose, onRebook, onAfter }: { order: any; onClose: () => void; onRebook: (o: any) => void; onAfter: () => void; }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const { can } = useAuth();
  const [showDebug, setShowDebug] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  async function loadDebug() { setShowDebug((v) => !v); if (!debug) { try { const r = await api.get("/api/shiprocket/debug?orderId=" + order.id); setDebug(r); } catch (e: any) { setDebug({ error: e?.message || "Debug load failed" }); } } }

  async function load() {
    setLoading(true); setErr("");
    try { const r = await api.get("/api/shiprocket/track?orderId=" + order.id); setData(r); }
    catch (e: any) { setErr(e?.message || "Track failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [order.id]);

  async function act(kind: string) {
    setBusy(kind); setMsg("");
    try {
      if (kind === "track") { await load(); onAfter(); setMsg("Tracking refreshed"); }
      else if (kind === "label") { const r = await api.post("/api/shiprocket/label", { orderId: order.id }); if (r.labelUrl) window.open(r.labelUrl, "_blank"); else setMsg("Label not ready yet"); }
      else if (kind === "manifest") { const r = await api.post("/api/shiprocket/manifest", { orderId: order.id }); if (r.manifestUrl) window.open(r.manifestUrl, "_blank"); else setMsg("Manifest not ready yet"); }
      else if (kind === "invoice") { window.open("/crm/invoice/" + order.id, "_blank"); }
      else if (kind === "pickup") { await api.post("/api/shiprocket/pickup", { orderId: order.id }); onAfter(); setMsg("Pickup requested"); }
      else if (kind === "cancel") { if (!confirm("Shipment cancel karein?")) { setBusy(""); return; } await api.post("/api/shiprocket/cancel", { orderId: order.id }); onAfter(); setMsg("Shipment cancelled"); }
      else if (kind === "rebook") { if (!confirm("Rebook / Change courier? Current shipment cancel hoga.")) { setBusy(""); return; } await api.post("/api/shiprocket/reset", { orderId: order.id }); onAfter(); onClose(); onRebook(order); }
    } catch (e: any) { setMsg(e?.message || "Action failed"); }
    finally { setBusy(""); }
  }

  const cur = data?.current || order.trackingStage || order.shippingStatus || "-";
  const Btn = (k: string, label: string, cls = "bg-gray-100 text-gray-700 hover:bg-gray-200") => (
    <button disabled={busy === k} onClick={() => act(k)} className={"rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 " + cls}>{busy === k ? "..." : label}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-gray-800">Shipment - #{order.orderCode}</h3>
            <p className="text-xs text-gray-500">AWB {order.awbCode || "-"} - {order.courierName || "-"}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{cur}</span>
            {data?.etd && <span className="text-xs text-gray-500">Expected: {data.etd}</span>}
            {data?.rto && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">RTO</span>}
            {data?.ndr && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">NDR</span>}
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {Btn("track", "Refresh", "bg-blue-50 text-blue-700 hover:bg-blue-100")}
            {Btn("label", "Label")}
            {Btn("manifest", "Manifest")}
            {Btn("invoice", "Invoice")}
            {Btn("pickup", "Request Pickup")}
            {Btn("rebook", "Rebook / Change Courier", "bg-amber-50 text-amber-700 hover:bg-amber-100")}
            {Btn("cancel", "Cancel", "bg-red-50 text-red-600 hover:bg-red-100")}
          </div>
          {msg && <div className="mb-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{msg}</div>}

          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tracking Timeline</div>
          {loading ? <div className="py-6 text-center text-sm text-gray-400">Loading tracking...</div>
          : err ? <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>
          : (data?.timeline?.length ? (
            <ol className="mt-2 space-y-3 border-l-2 border-gray-200 pl-4">
              {data.timeline.map((t: TL, i: number) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <div className="text-sm font-medium text-gray-800">{t.status || t.activity || "-"}</div>
                  {t.activity && t.activity !== t.status && <div className="text-xs text-gray-500">{t.activity}</div>}
                  <div className="text-[10px] text-gray-400">{t.date}{t.location ? " - " + t.location : ""}</div>
                </li>
              ))}
            </ol>
          ) : <div className="mt-2 text-xs text-gray-400">Abhi koi tracking event nahi (AWB naya hoga - thodi der me update aayega).</div>)}

          {can("users.manage") && (
            <div className="mt-4 border-t pt-3">
              <button onClick={loadDebug} className="text-xs font-semibold text-indigo-600 hover:underline">{showDebug ? "Hide" : "Show"} Developer Debug (raw request / response)</button>
              {showDebug && (
                <div className="mt-2 max-h-60 overflow-auto rounded-lg bg-gray-900 p-3 text-[10px] leading-relaxed text-gray-100">
                  {debug?.error && <div className="text-red-300">{debug.error}</div>}
                  {!debug?.error && (!debug?.logs || debug.logs.length === 0) && <div className="text-gray-400">Is order ka koi booking audit nahi mila.</div>}
                  {(debug?.logs || []).map((l: any) => (
                    <div key={l.id} className="mb-2 border-b border-gray-700 pb-2">
                      <div className="text-gray-400">{new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} - {l.user || "system"}</div>
                      <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(l.details, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">Close</button>
        </div>
      </div>
    </div>
  );
}