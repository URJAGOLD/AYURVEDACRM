"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { INDIA_MAP } from "@/lib/indiaStates";
function mapColor(n: number) { if (!n) return "#eef2f7"; if (n < 10) return "#bbf7d0"; if (n < 20) return "#86efac"; if (n < 40) return "#22c55e"; return "#15803d"; }
const MAP_LEGEND: [string, string][] = [["0", "#eef2f7"], ["1-9", "#bbf7d0"], ["10-19", "#86efac"], ["20-39", "#22c55e"], ["40+", "#15803d"]];

const SC: Record<string, string> = {
  "New": "#3b82f6", "Confirm Pending": "#0ea5e9", "Confirmed": "#22c55e", "Packed": "#8b5cf6",
  "In Transit": "#f97316", "Dispatched": "#f97316", "GPO Done": "#14b8a6", "GPO Pending": "#f59e0b",
  "GPO Delivered": "#15803d", "Delivered": "#15803d", "Callback": "#eab308", "Pending": "#f59e0b",
  "Cancelled": "#ef4444", "Confirm cancel": "#dc2626", "Cancel pending": "#f87171", "Final cancel": "#b91c1c",
  "Dealer Cancel": "#9f1239", "RTO": "#9f1239",
};
const sc = (s: string) => SC[s] || "#64748b";
const SRC: Record<string, string> = {
  "Meta": "#3b82f6", "Instagram": "#ec4899", "Facebook": "#1d4ed8", "WhatsApp": "#22c55e", "Google": "#f97316",
  "YouTube": "#ef4444", "Website": "#8b5cf6", "Landing Page": "#8b5cf6", "Calling": "#f59e0b", "Direct": "#14b8a6",
  "Orders": "#22c55e", "Manual": "#94a3b8", "Abandoned Cart": "#f59e0b", "Discount Lead": "#8b5cf6",
};
const srcC = (s: string) => SRC[s] || "#64748b";
const SHIP_C: Record<string,string> = {"Booked":"#3b82f6","Pickup Scheduled":"#06b6d4","In Transit":"#f97316","Out For Delivery":"#a855f7","Delivered":"#15803d","RTO":"#9f1239","Cancelled":"#ef4444"};
const shipColor = (s: string) => SHIP_C[s] || "#64748b";
const money = (n: number) => "Rs " + Number(n || 0).toLocaleString("en-IN");

function istToday() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }
function shift(day: string, n: number) { const x = new Date(day + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function monthStart(day: string) { return day.slice(0, 8) + "01"; }

function Kpi({ label, value, sub, grad }: { label: string; value: any; sub?: string; grad: string }) {
  return (
    <div className="rounded-xl p-4 text-white shadow-md" style={{ background: grad }}>
      <div className="text-xs font-medium opacity-90">{label}</div>
      <div className="text-2xl font-extrabold mt-1 leading-tight">{value}</div>
      {sub ? <div className="text-[11px] opacity-90 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export default function ReportsPage() {
  const today = istToday();
  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  const { data: srcData } = useQuery({ queryKey: ["rep-sources"], queryFn: () => api.get("/api/masters/sources") });
  const sources = srcData?.sources || [];

  function applyPreset(p: string) {
    setPreset(p);
    if (p === "all") { setFrom(""); setTo(""); }
    else if (p === "today") { setFrom(today); setTo(today); }
    else if (p === "yest") { const y = shift(today, -1); setFrom(y); setTo(y); }
    else if (p === "7") { setFrom(shift(today, -6)); setTo(today); }
    else if (p === "15") { setFrom(shift(today, -14)); setTo(today); }
    else if (p === "30") { setFrom(shift(today, -29)); setTo(today); }
    else if (p === "tm") { setFrom(monthStart(today)); setTo(today); }
    else if (p === "lm") { const lmEnd = shift(monthStart(today), -1); setFrom(monthStart(lmEnd)); setTo(lmEnd); }
  }

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (source) p.set("source", source);
    return p.toString();
  }, [from, to, source]);

  const { data, isLoading } = useQuery({ queryKey: ["reports", qs], queryFn: () => api.get("/api/reports?" + qs) });
  const rep: any = data;
  const s = rep?.summary;
  const aov = s && s.delivered ? Math.round(s.revenue / s.delivered) : 0;
  const cancelRate = s && s.total ? Math.round((s.cancelled / s.total) * 1000) / 10 : 0;
  const stateRows: any[] = rep?.stateBreakdown || [];
  const countByState: Record<string, number> = {};
  stateRows.forEach((x: any) => { countByState[x.state] = x.total; });
  const hoveredRec: any = hover ? stateRows.find((x: any) => x.state === hover) : null;

  const PILLS: [string, string][] = [["all", "All Time"], ["today", "Today"], ["yest", "Yesterday"], ["7", "7 Days"], ["15", "15 Days"], ["30", "30 Days"], ["tm", "This Month"], ["lm", "Last Month"]];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 rounded-2xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}>
        <h1 className="text-2xl font-extrabold">Reports &amp; Analytics</h1>
        <p className="text-sm opacity-80 mt-0.5">Sales performance, sources, agents aur revenue ka pura analysis</p>
      </div>

      <div className="card p-3 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {PILLS.map(([k, lbl]) => (
            <button key={k} onClick={() => applyPreset(k)} className={"px-3 py-1.5 rounded-full text-xs font-semibold transition " + (preset === k ? "text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200")} style={preset === k ? { background: "linear-gradient(135deg,#1b7a43,#14532d)" } : undefined}>{lbl}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} /></div>
          <div><label className="label">Source</label>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {sources.map((x: any) => <option key={x.id} value={x.name}>{x.name}</option>)}
            </select>
          </div>
          <div className="text-xs text-gray-500 pb-2">{from || to ? ((from || "start") + " to " + (to || "today")) : "All time data"}</div>
        </div>
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-6 text-center">Loading analytics...</div>}

      {s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            <Kpi label="Total Orders" value={s.total} grad="linear-gradient(135deg,#3b82f6,#2563eb)" />
            <Kpi label="Confirmed" value={s.confirmedAll} sub={"Conversion " + s.conversionRate + "%"} grad="linear-gradient(135deg,#22c55e,#16a34a)" />
            <Kpi label="Delivered" value={s.delivered} grad="linear-gradient(135deg,#15803d,#166534)" />
            <Kpi label="Cancelled" value={s.cancelled} sub={cancelRate + "% of total"} grad="linear-gradient(135deg,#ef4444,#dc2626)" />
            <Kpi label="Pending" value={s.pending} grad="linear-gradient(135deg,#f59e0b,#d97706)" />
            <Kpi label="Delivered Revenue" value={money(s.revenue)} grad="linear-gradient(135deg,#10b981,#059669)" />
            <Kpi label="Avg Order Value" value={money(aov)} grad="linear-gradient(135deg,#14b8a6,#0d9488)" />
            <Kpi label="Conversion Rate" value={s.conversionRate + "%"} grad="linear-gradient(135deg,#8b5cf6,#7c3aed)" />
            <Kpi label="Callback" value={s.callback} grad="linear-gradient(135deg,#eab308,#ca8a04)" />
            <Kpi label="Cancel Rate" value={cancelRate + "%"} grad="linear-gradient(135deg,#f43f5e,#e11d48)" />
          </div>
          {rep.shipmentSummary && (
            <div className="card p-4 mb-4">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span>{"\uD83D\uDE9A"}</span>Shipment / Delivery (Shiprocket)</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <Kpi label="Booked" value={rep.shipmentSummary.booked} grad="linear-gradient(135deg,#3b82f6,#2563eb)" />
                <Kpi label="In Transit" value={rep.shipmentSummary.inTransit} grad="linear-gradient(135deg,#f97316,#ea580c)" />
                <Kpi label="Delivered" value={rep.shipmentSummary.delivered} grad="linear-gradient(135deg,#15803d,#166534)" />
                <Kpi label="RTO" value={rep.shipmentSummary.rto} grad="linear-gradient(135deg,#9f1239,#881337)" />
                <Kpi label="Cancelled" value={rep.shipmentSummary.cancelled} grad="linear-gradient(135deg,#ef4444,#dc2626)" />
                <Kpi label="Not Booked" value={rep.shipmentSummary.notBooked} grad="linear-gradient(135deg,#64748b,#475569)" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">Shipment Status Breakdown (booked orders)</div>
                  {rep.shipmentBreakdown.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Koi booked shipment nahi</p>}
                  {rep.shipmentBreakdown.map((r: any) => (
                    <div key={r.status} className="mb-2.5">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold" style={{ color: shipColor(r.status) }}>{r.status}</span>
                        <span className="text-gray-500">{r.count} &middot; {r.pct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(r.pct, 2) + "%", background: shipColor(r.status) }} /></div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">Courier-wise Split</div>
                  <div className="overflow-x-auto">
                    <table className="text-sm w-full">
                      <thead className="text-gray-500 text-left text-xs"><tr><th className="py-1">Courier</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Delivered</th><th className="py-1 text-right">Deliv%</th></tr></thead>
                      <tbody>
                        {rep.courierSplit.map((r: any) => (
                          <tr key={r.courier} className="border-t border-gray-100">
                            <td className="py-1.5 font-medium text-gray-800">{r.courier}</td>
                            <td className="py-1.5 text-right font-semibold">{r.total}</td>
                            <td className="py-1.5 text-right text-emerald-700">{r.delivered}</td>
                            <td className="py-1.5 text-right font-semibold" style={{ color: r.deliveredPct >= 70 ? "#16a34a" : r.deliveredPct >= 40 ? "#f59e0b" : "#ef4444" }}>{r.deliveredPct}%</td>
                          </tr>
                        ))}
                        {rep.courierSplit.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">Koi courier data nahi</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span>{"\uD83D\uDCCA"}</span>Status Breakdown</h2>
              {rep.statusBreakdown.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No data</p>}
              {rep.statusBreakdown.map((r: any) => (
                <div key={r.status} className="mb-2.5">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold" style={{ color: sc(r.status) }}>{r.status}</span>
                    <span className="text-gray-500">{r.count} &middot; {r.pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: Math.max(r.pct, 2) + "%", background: sc(r.status) }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-4">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span>{"\uD83D\uDCE3"}</span>Source Performance</h2>
              <div className="overflow-x-auto">
                <table className="text-sm w-full">
                  <thead className="text-gray-500 text-left text-xs"><tr><th className="py-1">Source</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Conf.</th><th className="py-1 text-right">Deliv.</th><th className="py-1 text-right">Conv%</th><th className="py-1 text-right">Revenue</th></tr></thead>
                  <tbody>
                    {rep.sourceBreakdown.map((r: any) => {
                      const conv = r.total ? Math.round((r.confirmed / r.total) * 1000) / 10 : 0;
                      return (
                        <tr key={r.source} className="border-t border-gray-100">
                          <td className="py-1.5"><span className="px-2 py-0.5 rounded-full text-white text-[11px] font-semibold" style={{ background: srcC(r.source) }}>{r.source}</span></td>
                          <td className="py-1.5 text-right font-semibold">{r.total}</td>
                          <td className="py-1.5 text-right text-green-600">{r.confirmed}</td>
                          <td className="py-1.5 text-right text-emerald-700">{r.delivered}</td>
                          <td className="py-1.5 text-right font-semibold" style={{ color: conv >= 30 ? "#16a34a" : conv >= 15 ? "#f59e0b" : "#ef4444" }}>{conv}%</td>
                          <td className="py-1.5 text-right font-bold text-gray-800">{money(r.revenue)}</td>
                        </tr>
                      );
                    })}
                    {rep.sourceBreakdown.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card p-4 mb-4">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-base"><span>&#128101;</span>Agent / Lead Owner Performance</h2>
            {rep.agentSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-center"><div className="text-[10px] text-indigo-500 font-semibold uppercase">Assigned</div><div className="text-xl font-extrabold text-indigo-700">{rep.agentSummary.totalAssigned}</div></div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center"><div className="text-[10px] text-emerald-500 font-semibold uppercase">Worked</div><div className="text-xl font-extrabold text-emerald-700">{rep.agentSummary.totalWorked}</div></div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-2 text-center"><div className="text-[10px] text-red-500 font-semibold uppercase">Untouched</div><div className="text-xl font-extrabold text-red-600">{rep.agentSummary.totalUntouched}</div></div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center"><div className="text-[10px] text-amber-500 font-semibold uppercase">Overdue FU</div><div className="text-xl font-extrabold text-amber-600">{rep.agentSummary.totalOverdue}</div></div>
                <div className="rounded-lg bg-orange-50 border border-orange-100 p-2 text-center"><div className="text-[10px] text-orange-500 font-semibold uppercase">Today FU</div><div className="text-xl font-extrabold text-orange-600">{rep.agentSummary.totalToday}</div></div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-2 text-center"><div className="text-[10px] text-green-600 font-semibold uppercase">Confirmed</div><div className="text-xl font-extrabold text-green-700">{rep.agentSummary.totalConfirmed}</div></div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="text-sm w-full min-w-[900px]">
                <thead className="text-gray-500 text-left text-xs bg-gray-50"><tr><th className="px-2 py-2">Agent</th><th className="px-2 py-2 text-right text-indigo-600">Assigned</th><th className="px-2 py-2 text-right text-red-500">Untouched</th><th className="px-2 py-2 text-right text-emerald-600">Worked</th><th className="px-2 py-2 text-right">Worked%</th><th className="px-2 py-2 text-right text-green-600">Confirmed</th><th className="px-2 py-2 text-right text-amber-600">Overdue FU</th><th className="px-2 py-2 text-right text-orange-500">Today FU</th><th className="px-2 py-2 text-right text-blue-500">Upcoming FU</th><th className="px-2 py-2 text-right text-emerald-700">Delivered</th><th className="px-2 py-2 text-right text-red-500">Cancelled</th><th className="px-2 py-2 text-right text-gray-500">Conv%</th><th className="px-2 py-2 text-right text-gray-700">Revenue</th></tr></thead>
                <tbody>
                  {(rep.agentDetail || []).map((r: any) => {
                    const isExp = expandedAgent === r.agentId;
                    const alertBg = r.alert === "red" ? "#ef4444" : r.alert === "yellow" ? "#f59e0b" : "#22c55e";
                    const alertLabel = r.untouched > 20 ? "Too Many Untouched" : r.fuOverdue > 5 ? "Overdue Followups" : r.workedPct < 30 ? "Low Activity" : "Healthy";
                    return (<><tr key={r.agentId} className={"border-t border-gray-100 cursor-pointer hover:bg-indigo-50 " + (isExp ? "bg-indigo-50" : "")} onClick={() => setExpandedAgent(isExp ? null : r.agentId)}><td className="px-2 py-2"><div className="flex items-center gap-1 flex-wrap"><span className="font-bold text-indigo-700 mr-1">{r.agent}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white" style={{background: alertBg}}>{alertLabel}</span>{r.untouched > 10 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">{r.untouched} Untouched</span>}{r.fuOverdue > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">{r.fuOverdue} Overdue</span>}<span className="text-gray-300 ml-1 text-xs">{isExp ? "[-]" : "[+]"}</span></div></td><td className="px-2 py-2 text-right font-bold text-indigo-700">{r.assigned}</td><td className="px-2 py-2 text-right font-bold text-red-600">{r.untouched}</td><td className="px-2 py-2 text-right text-emerald-700 font-medium">{r.worked}</td><td className="px-2 py-2 text-right"><div className="flex items-center gap-1 justify-end"><div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{width: r.workedPct + "%", background: r.workedPct >= 70 ? "#22c55e" : r.workedPct >= 40 ? "#f59e0b" : "#ef4444"}} /></div><span className="text-xs w-8 text-right">{r.workedPct}%</span></div></td><td className="px-2 py-2 text-right font-bold text-green-600">{r.confirmed}</td><td className="px-2 py-2 text-right font-bold text-amber-600">{r.fuOverdue || 0}</td><td className="px-2 py-2 text-right font-medium text-orange-500">{r.fuToday || 0}</td><td className="px-2 py-2 text-right text-blue-400">{r.fuUpcoming || 0}</td><td className="px-2 py-2 text-right text-emerald-700">{r.delivered}</td><td className="px-2 py-2 text-right text-red-500">{r.cancelled}</td><td className="px-2 py-2 text-right"><div className="flex items-center gap-1 justify-end"><div className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{width: Math.max(r.conversion, 2) + "%", background: r.conversion >= 30 ? "#16a34a" : r.conversion >= 15 ? "#f59e0b" : "#ef4444"}} /></div><span className="text-xs w-7">{r.conversion}%</span></div></td><td className="px-2 py-2 text-right font-bold text-gray-800">{money(r.revenue)}</td></tr>{isExp && (<tr key={r.agentId + "_exp"}><td colSpan={13} className="px-4 py-3 bg-indigo-50 border-b border-indigo-100"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs"><div className="rounded-lg bg-white border border-indigo-100 p-3"><div className="font-bold text-indigo-700 mb-2">Work Summary</div><div className="space-y-1"><div className="flex justify-between"><span className="text-gray-500">Assigned</span><span className="font-bold text-indigo-700">{r.assigned}</span></div><div className="flex justify-between"><span className="text-gray-500">Worked</span><span className="font-bold text-emerald-600">{r.worked} ({r.workedPct}%)</span></div><div className="flex justify-between"><span className="text-gray-500">Untouched</span><span className="font-bold text-red-600">{r.untouched}</span></div><div className="flex justify-between"><span className="text-gray-500">Total Actions</span><span className="font-bold">{r.totalActions}</span></div></div></div><div className="rounded-lg bg-white border border-amber-100 p-3"><div className="font-bold text-amber-700 mb-2">Follow-up Status</div><div className="space-y-1"><div className="flex justify-between"><span className="text-red-500 font-medium">Overdue</span><span className="font-bold text-red-600">{r.fuOverdue}</span></div><div className="flex justify-between"><span className="text-orange-500 font-medium">Today</span><span className="font-bold text-orange-600">{r.fuToday}</span></div><div className="flex justify-between"><span className="text-blue-500 font-medium">Upcoming</span><span className="font-bold text-blue-600">{r.fuUpcoming}</span></div></div></div><div className="rounded-lg bg-white border border-green-100 p-3"><div className="font-bold text-green-700 mb-2">Status Breakdown</div><div className="space-y-1"><div className="flex justify-between"><span className="text-gray-500">Confirmed</span><span className="font-bold text-green-600">{r.confirmed}</span></div><div className="flex justify-between"><span className="text-gray-500">Delivered</span><span className="font-bold text-emerald-700">{r.delivered}</span></div><div className="flex justify-between"><span className="text-gray-500">Callback</span><span className="font-bold text-yellow-600">{r.callback}</span></div><div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="font-bold text-orange-600">{r.pending}</span></div><div className="flex justify-between"><span className="text-gray-500">GPO Done</span><span className="font-bold text-teal-600">{r.gpoDone}</span></div><div className="flex justify-between"><span className="text-gray-500">Cancelled</span><span className="font-bold text-red-500">{r.cancelled}</span></div><div className="flex justify-between"><span className="text-gray-500">Conversion</span><span className="font-bold text-indigo-600">{r.conversion}%</span></div><div className="flex justify-between"><span className="text-gray-500">Revenue</span><span className="font-bold text-gray-800">{money(r.revenue)}</span></div></div></div>{Object.keys(r.activityBreakdown || {}).length > 0 && (<div className="rounded-lg bg-white border border-purple-100 p-3 sm:col-span-2 lg:col-span-3"><div className="font-bold text-purple-700 mb-2">Activity Breakdown (range actions)</div><div className="flex flex-wrap gap-2">{Object.entries(r.activityBreakdown).sort((a: any, b: any) => (b[1] as number) - (a[1] as number)).map(([st, cnt]: any) => (<span key={st} className="px-2 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">{st}: {cnt}</span>))}</div></div>)}</div></td></tr>)}</>);
                  })}
                  {(!rep.agentDetail || rep.agentDetail.length === 0) && <tr><td colSpan={13} className="py-4 text-center text-gray-400">No agent data for selected range</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">* Worked = Agent ne OrderHistory mein action add kiya. Untouched = koi action nahi. Followups = current time based. Row click karein detail ke liye.</p>
          </div>
          <div className="card p-4 mb-4">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span>{"\uD83D\uDDFA\uFE0F"}</span>Orders by State (India Map)</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div className="h-6 mb-1 text-sm">
                  {hover ? <span><b style={{ color: mapColor(hoveredRec?.total || 0) }}>{hover}</b><span className="text-gray-600">{"  -  " + (hoveredRec?.total || 0) + " orders, " + (hoveredRec?.confirmed || 0) + " confirmed" + (hoveredRec?.revenue ? ", Rs " + Number(hoveredRec.revenue).toLocaleString("en-IN") : "")}</span></span> : <span className="text-gray-400">Kisi rajya par hover / tap karein</span>}
                </div>
                <svg viewBox={INDIA_MAP.viewBox} className="w-full h-auto" style={{ maxHeight: 540 }}>
                  {Object.entries(INDIA_MAP.paths).map(([name, d]) => (
                    <path key={name} d={d as string} fill={mapColor(countByState[name] || 0)} stroke="#ffffff" strokeWidth={0.6} onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)} onClick={() => setHover(name)} style={{ cursor: "pointer", outline: "none" }} />
                  ))}
                </svg>
                <div className="flex items-center flex-wrap gap-2 mt-2 text-[11px] text-gray-500">
                  <span className="mr-1 font-medium">Orders:</span>
                  {MAP_LEGEND.map(([lbl, col]) => (
                    <span key={lbl} className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded-sm border border-gray-200" style={{ background: col }} />{lbl}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">Top States</div>
                <div className="overflow-auto max-h-[440px]">
                  <table className="text-sm w-full">
                    <thead className="text-gray-500 text-left text-xs"><tr><th className="py-1">State</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Conf.</th></tr></thead>
                    <tbody>
                      {stateRows.map((r: any) => (
                        <tr key={r.state} className={"border-t border-gray-100 cursor-pointer " + (hover === r.state ? "bg-emerald-50" : "")} onMouseEnter={() => setHover(r.state)} onMouseLeave={() => setHover(null)}>
                          <td className="py-1.5 flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: mapColor(r.total) }} />{r.state}</td>
                          <td className="py-1.5 text-right font-semibold">{r.total}</td>
                          <td className="py-1.5 text-right text-green-600">{r.confirmed}</td>
                        </tr>
                      ))}
                      {stateRows.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">No state data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Note: jin orders me state bhara hai sirf wahi map par dikhte hain. Telangana is map me Andhra Pradesh ka hissa hai (list me alag dikhta hai).</p>
          </div>
          {rep.dealerCumulative && rep.dealerCumulative.length > 0 && (
            <div className="card p-4 mb-4">
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><span>{"\uD83C\uDFEA"}</span>Dealer Cumulative</h2>
              <table className="text-sm w-full">
                <thead className="text-gray-500 text-left text-xs"><tr><th className="py-1">Dealer</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Delivered</th><th className="py-1 text-right">Revenue</th></tr></thead>
                <tbody>
                  {rep.dealerCumulative.map((r: any) => (
                    <tr key={r.dealer} className="border-t border-gray-100"><td className="py-1.5 font-medium">{r.dealer}</td><td className="py-1.5 text-right">{r.total}</td><td className="py-1.5 text-right text-emerald-700">{r.delivered}</td><td className="py-1.5 text-right font-bold">{money(r.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}