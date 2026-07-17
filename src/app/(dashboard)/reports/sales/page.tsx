"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

const money = (n: number) => "Rs " + Number(n || 0).toLocaleString("en-IN");
function istToday() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }
function shift(day: string, n: number) { const x = new Date(day + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function monthStart(day: string) { return day.slice(0, 8) + "01"; }
const sname = (x: any) => (typeof x === "string" ? x : (x?.name ?? ""));

function Kpi({ label, value, sub, grad }: { label: string; value: any; sub?: string; grad: string }) {
  return (
    <div className="rounded-xl p-4 text-white shadow-md" style={{ background: grad }}>
      <div className="text-xs font-medium opacity-90">{label}</div>
      <div className="text-2xl font-extrabold mt-1 leading-tight">{value}</div>
      {sub ? <div className="text-[11px] opacity-90 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export default function SalesReportPage() {
  const today = istToday();
  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");

  const { data: srcData } = useQuery({ queryKey: ["sales-rep-sources"], queryFn: () => api.get("/api/masters/sources") });
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

  const { data, isLoading } = useQuery({ queryKey: ["sales-report", qs], queryFn: () => api.get("/api/reports/sales?" + qs) });
  const rep: any = data;
  const s = rep?.summary;
  const statusRows: any[] = rep?.statusBreakdown || [];
  const sourceRows: any[] = rep?.sourceBreakdown || [];
  const dailyRows: any[] = rep?.dailyBreakdown || [];

  const PILLS: [string, string][] = [["all", "All Time"], ["today", "Today"], ["yest", "Yesterday"], ["7", "7 Days"], ["15", "15 Days"], ["30", "30 Days"], ["tm", "This Month"], ["lm", "Last Month"]];
  const rangeLabel = (from || to) ? ((from || "...") + " to " + (to || "...")) : "All Time";

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 rounded-2xl p-5 text-white shadow-lg text-center" style={{ background: "linear-gradient(135deg,#064e3b,#15803d)" }}>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-wide">PRAKRITI HERBS PRIVATE LIMITED</h1>
        <p className="text-sm opacity-90 mt-1">Sales Report &middot; Delivered + GPO Delivered</p>
        <p className="text-[11px] opacity-80 mt-0.5">{rangeLabel}</p>
      </div>

      <div className="card p-3 mb-4">
        <div className="flex flex-wrap gap-2 mb-3 justify-center">
          {PILLS.map(([k, lbl]) => (
            <button key={k} onClick={() => applyPreset(k)}
              className={"px-3 py-1.5 rounded-full text-xs font-semibold transition " + (preset === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-center">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(""); }} className="border rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(""); }} className="border rounded-lg px-2 py-1.5 text-sm" />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="">All Sources</option>
            {sources.map((x: any, i: number) => { const n = sname(x); return <option key={i} value={n}>{n}</option>; })}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-500">Loading sales report...</div>
      ) : !s ? (
        <div className="card p-8 text-center text-slate-500">No data</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi label="Total Sales" value={s.total} sub="Delivered + GPO" grad="linear-gradient(135deg,#15803d,#22c55e)" />
            <Kpi label="Delivered" value={s.delivered} grad="linear-gradient(135deg,#059669,#10b981)" />
            <Kpi label="GPO Delivered" value={s.gpoDelivered} grad="linear-gradient(135deg,#0f766e,#14b8a6)" />
            <Kpi label="Revenue" value={money(s.revenue)} sub={"AOV " + money(s.aov)} grad="linear-gradient(135deg,#1e293b,#334155)" />
          </div>

          <div className="card p-4 mb-4">
            <h2 className="text-sm font-bold text-slate-700 mb-3 text-center">Status Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr className="text-slate-500 border-b">
                    <th className="py-2 font-semibold">STATUS</th>
                    <th className="py-2 font-semibold">ORDER COUNT</th>
                    <th className="py-2 font-semibold">PERCENTAGE (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium text-slate-700">{r.status}</td>
                      <td className="py-2">{r.count}</td>
                      <td className="py-2">{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-emerald-700 border-t-2">
                    <td className="py-2">TOTAL</td>
                    <td className="py-2">{s.total}</td>
                    <td className="py-2">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid gap-3 mb-4">
            {sourceRows.map((r, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-700">{r.source}</h3>
                  <span className="text-xs font-semibold text-emerald-700">{r.pct}% &middot; {money(r.revenue)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-center">
                    <thead>
                      <tr className="text-slate-500 border-b">
                        <th className="py-2 font-semibold">STATUS</th>
                        <th className="py-2 font-semibold">ORDER COUNT</th>
                        <th className="py-2 font-semibold">PERCENTAGE (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([["Delivered", r.delivered], ["GPO Delivered", r.gpoDelivered]] as [string, number][])
                        .filter((x) => x[1] > 0)
                        .map(([st, c], j) => (
                          <tr key={j} className="border-b last:border-0">
                            <td className="py-2 font-medium text-slate-700">{st}</td>
                            <td className="py-2">{c}</td>
                            <td className="py-2">{r.count ? Math.round((c / r.count) * 1000) / 10 : 0}%</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-slate-700 border-t-2">
                        <td className="py-2">TOTAL</td>
                        <td className="py-2">{r.count}</td>
                        <td className="py-2">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {dailyRows.length > 0 && (
            <div className="card p-4 mb-4">
              <h2 className="text-sm font-bold text-slate-700 mb-3 text-center">Day-wise Sales</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <thead>
                    <tr className="text-slate-500 border-b">
                      <th className="py-2 font-semibold">DATE</th>
                      <th className="py-2 font-semibold">ORDERS</th>
                      <th className="py-2 font-semibold">REVENUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{r.date}</td>
                        <td className="py-2">{r.count}</td>
                        <td className="py-2">{money(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card p-4 text-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-slate-400 text-xs">Total Orders</div><div className="font-bold text-slate-700">{s.total}</div></div>
              <div><div className="text-slate-400 text-xs">Delivered</div><div className="font-bold text-emerald-700">{s.delivered}</div></div>
              <div><div className="text-slate-400 text-xs">GPO Delivered</div><div className="font-bold text-teal-700">{s.gpoDelivered}</div></div>
              <div><div className="text-slate-400 text-xs">Total Revenue</div><div className="font-bold text-slate-900">{money(s.revenue)}</div></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}