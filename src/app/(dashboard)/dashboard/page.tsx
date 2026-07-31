"use client";
import { useState, Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { DEFAULT_PREFERENCES } from "@/lib/crmDefaults";

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
const rs = (n: number) => "Rs " + fmt(n);
function trendOf(cur?: number, prev?: number, goodUp = true): { pct: number; up: boolean; good: boolean } | null { if (cur == null || prev == null || prev === 0) return null; const pct = Math.round(((cur - prev) / prev) * 100); const up = cur >= prev; return { pct, up, good: up === goodUp }; }
const ten = (p: string) => (p || "").replace(/\D/g, "").slice(-10);
const wa = (p: string) => "https://wa.me/91" + ten(p);
const tel = (p: string) => "tel:+91" + ten(p);
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const shiftStr = (s: string, d: number) => { const x = new Date(s + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const pad2 = (n: number) => String(n).padStart(2, "0");
const dmy = (s: string) => { const p = (s || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] : s; };
const tIST = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

function buildPresets() {
  const t = istToday();
  const d = new Date(t + "T00:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const mStart = y + "-" + pad2(m + 1) + "-01";
  const lmY = m === 0 ? y - 1 : y;
  const lmM = m === 0 ? 12 : m;
  const lmStart = lmY + "-" + pad2(lmM) + "-01";
  const lmEnd = shiftStr(mStart, -1);
  return [
    { k: "Today", from: t, to: t },
    { k: "Yesterday", from: shiftStr(t, -1), to: shiftStr(t, -1) },
    { k: "3 Days", from: shiftStr(t, -2), to: t },
    { k: "7 Days", from: shiftStr(t, -6), to: t },
    { k: "15 Days", from: shiftStr(t, -14), to: t },
    { k: "30 Days", from: shiftStr(t, -29), to: t },
    { k: "This Month", from: mStart, to: t },
    { k: "Last Month", from: lmStart, to: lmEnd },
  ];
}

const SC: Record<string, string> = {
  "New": "#3b82f6", "Confirmed": "#22c55e", "Confirm Pending": "#f59e0b", "Packed": "#8b5cf6",
  "In Transit": "#f97316", "Dispatched": "#f97316", "GPO Done": "#f97316", "GPO Pending": "#f59e0b",
  "Delivered": "#15803d", "GPO Delivered": "#15803d", "Callback": "#eab308", "Pending": "#f59e0b",
  "Cancelled": "#ef4444", "Confirm cancel": "#ef4444", "Cancel pending": "#ef4444", "Final cancel": "#ef4444", "Dealer Cancel": "#ef4444", "RTO": "#9f1239",
};
const sc = (s: string) => SC[s] || "#64748b";

type KPI = { orders: number; revenue: number; online: number; codPending: number; confirmed: number; delivered: number; dispatched: number; cancelled: number; pending: number; newCust: number; repeatCust: number; followToday: number; overdue: number; followTomorrow: number };
type LV = { label: string; value: number };
type Data = {
  range: { from: string; to: string; today: string }; scope: string; kpi: KPI; prevKpi?: { [k: string]: number };
  byStatus: Record<string, number>; payment: { online: number; codPending: number; modes: Record<string, number> };
  source: LV[]; products: LV[]; states: LV[]; daily: { date: string; orders: number; revenue: number }[];
  leadOwners: { name: string; orders: number; confirmed: number; revenue: number }[];
  followList: { id: number; orderCode: string; customerName: string; contactNumber: string; city: string | null; orderStatus: string; followUpDate: string | null }[];
  liveFeed: { id: number; orderCode: string; customerName: string; contactNumber: string; status: string; total: number; source: string | null; dateTime: string }[];
};

function Kpi({ icon, label, value, cls, trend }: { icon: string; label: string; value: string; cls: string; trend?: { pct: number; up: boolean; good: boolean } | null }) {
  return (
    <div className={"rounded-2xl p-4 text-white shadow-md bg-gradient-to-br " + cls + " transition hover:-translate-y-0.5 hover:shadow-xl"}>
      <div className="text-2xl leading-none">{icon}</div>
      <div className="text-2xl font-extrabold mt-2 leading-tight">{value}</div>
      <div className="text-xs font-medium opacity-90 mt-0.5">{label}</div>
      {trend && <div className="mt-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] font-bold" style={{ color: trend.good ? "#bbf7d0" : "#fecaca" }}><span className="text-[9px]">{trend.up ? "\u25B2" : "\u25BC"}</span>{Math.abs(trend.pct)}% <span className="opacity-70 font-normal">vs prev</span></div>}
    </div>
  );
}
function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-gray-800">{title}</h3>{extra}</div>
      {children}
    </div>
  );
}
function Bars({ items, colorFn }: { items: LV[]; colorFn?: (l: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="text-sm text-gray-400">No data</div>;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-sm">
          <div className="w-28 truncate text-gray-600" title={it.label}>{it.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: (it.value / max * 100) + "%", background: colorFn ? colorFn(it.label) : "#2563eb" }} />
          </div>
          <div className="w-10 text-right font-semibold text-gray-700">{fmt(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
function Trend({ rows }: { rows: { date: string; orders: number; revenue: number }[] }) {
  if (!rows.length) return <div className="text-sm text-gray-400">No data</div>;
  const max = Math.max(1, ...rows.map((r) => r.orders));
  return (
    <div className="flex items-end gap-1 h-40">
      {rows.map((r) => (
        <div key={r.date} className="flex-1 flex flex-col items-center justify-end group">
          <div className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100">{r.orders}</div>
          <div className="w-full rounded-t bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: (r.orders / max * 100) + "%", minHeight: r.orders ? "4px" : "0" }} title={r.date + ": " + r.orders + " orders, Rs " + r.revenue} />
          <div className="text-[9px] text-gray-400 mt-1">{dmy(r.date)}</div>
        </div>
      ))}
    </div>
  );
}
const Badge = ({ s }: { s: string }) => <span className="badge text-white" style={{ background: sc(s) }}>{s}</span>;

export default function DashboardPage() {
  const presets = buildPresets();
  const [range, setRange] = useState({ from: presets[0].from, to: presets[0].to });
  const [activeK, setActiveK] = useState("Today");
  const [custom, setCustom] = useState(false);
  const [dateBasis, setDateBasis] = useState<"order"|"status">("order"); // dateBasis_toggle_4F
  const { data: crmCfg } = useQuery<any>({ queryKey: ["crm-settings"], queryFn: () => api.get("/api/settings/crm"), staleTime: 300000, refetchOnWindowFocus: false });
  const dashPrefs = crmCfg?.preferences || DEFAULT_PREFERENCES;
  const { data, isLoading, error, isFetching } = useQuery<Data>({
    queryKey: ["dash", range.from, range.to, dateBasis],
    queryFn: () => api.get("/api/dashboard/stats?from=" + range.from + "&to=" + range.to + "&dateBasis=" + dateBasis),
    refetchInterval: (dashPrefs.dashboardRefreshSec || 60) * 1000,
  });
  const { data: agentStats } = useQuery<{ scope: string; agents: any[]; totals: any }>({
    queryKey: ["agent-stats"],
    queryFn: () => api.get("/api/agent-stats"),
    refetchInterval: 30000,
  });
  const { data: dealerStats } = useQuery<{ scope: string; dealers: any[]; totals: any }>({
    queryKey: ["dealer-stats"],
    queryFn: () => api.get("/api/dealer-stats"),
    refetchInterval: 60000,
  });
  const [openAgent, setOpenAgent] = useState<number | null>(null);
  const pick = (p: { k: string; from: string; to: string }) => { setActiveK(p.k); setCustom(false); setRange({ from: p.from, to: p.to }); };
  const k = data?.kpi;
  const p = data?.prevKpi;
  const cards = k ? [
    { icon: "\uD83D\uDCE6", label: "Orders", value: fmt(k.orders), cls: "from-blue-500 to-blue-700", trend: trendOf(k.orders, p?.orders, true) },
    { icon: "\uD83D\uDCB0", label: "Revenue", value: rs(k.revenue), cls: "from-emerald-500 to-green-700", trend: trendOf(k.revenue, p?.revenue, true) },
    { icon: "\uD83C\uDFE6", label: "Online Received", value: rs(k.online), cls: "from-teal-500 to-cyan-700", trend: trendOf(k.online, p?.online, true) },
    { icon: "\u23F3", label: "COD Pending", value: rs(k.codPending), cls: "from-amber-500 to-orange-600", trend: trendOf(k.codPending, p?.codPending, false) },
    { icon: "\u2705", label: "Confirmed", value: fmt(k.confirmed), cls: "from-green-500 to-emerald-700", trend: trendOf(k.confirmed, p?.confirmed, true) },
    { icon: "\uD83D\uDD52", label: "Pending", value: fmt(k.pending), cls: "from-yellow-500 to-amber-600", trend: trendOf(k.pending, p?.pending, false) },
    { icon: "\uD83D\uDE9A", label: "Dispatched", value: fmt(k.dispatched), cls: "from-orange-500 to-orange-700", trend: trendOf(k.dispatched, p?.dispatched, true) },
    { icon: "\uD83C\uDF89", label: "Delivered", value: fmt(k.delivered), cls: "from-green-700 to-green-900", trend: trendOf(k.delivered, p?.delivered, true) },
    { icon: "\u274C", label: "Cancelled", value: fmt(k.cancelled), cls: "from-red-500 to-rose-700", trend: trendOf(k.cancelled, p?.cancelled, false) },
    { icon: "\uD83C\uDF1F", label: "New Customers", value: fmt(k.newCust), cls: "from-cyan-500 to-blue-600" },
    { icon: "\uD83D\uDD01", label: "Repeat Customers", value: fmt(k.repeatCust), cls: "from-violet-500 to-purple-700" },
    { icon: "\uD83D\uDCDE", label: "Follow-ups Today", value: fmt(k.followToday), cls: "from-pink-500 to-rose-600" },
  ] : [];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="rounded-2xl p-5 text-white bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Dashboard</h1>
            <p className="text-sm text-slate-300">{data ? data.range.from + " to " + data.range.to : "Loading..."}{data?.scope === "own" ? " - your leads" : ""}{isFetching ? " - refreshing..." : ""}</p>
          </div>
          <Link href="/orders" className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur">Open Orders -&gt;</Link>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {presets.map((p) => (
            <button key={p.k} onClick={() => pick(p)} className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (activeK === p.k && !custom ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20")}>{p.k}</button>
          ))}
          <button onClick={() => { setCustom(true); setActiveK(""); }} className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (custom ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20")}>Custom</button>
          {custom && (
            <span className="flex items-center gap-2 bg-white/10 rounded-full px-2 py-1">
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
              <span className="text-xs">-</span>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
            </span>
          )}
        </div>
        {/* dateBasis_toggle_4F */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10">
          <span className="text-xs text-slate-400 font-medium">Numbers based on:</span>
          <button onClick={() => setDateBasis("order")} className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (dateBasis==="order" ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20")}>
            [D] Order Date
          </button>
          <button onClick={() => setDateBasis("status")} className={"rounded-full px-3 py-1 text-xs font-semibold transition " + (dateBasis==="status" ? "bg-amber-300 text-slate-900" : "bg-white/10 text-white hover:bg-white/20")}>
            [S] Status Change Date
          </button>
          {dateBasis==="status" && <span className="text-[10px] text-amber-300 font-medium">Sirf jin orders ka status iss period mein badla</span>}
        </div>
      </div>

      {error && <div className="card p-4 text-red-600">Error: {(error as Error).message}</div>}
      {isLoading && <div className="card p-6 text-gray-500">Loading dashboard...</div>}

      {data && k && (<>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {cards.map((c) => <Kpi key={c.label} {...c} />)}
        </div>

        {(k.followToday > 0 || k.overdue > 0 || k.followTomorrow > 0) && (
          <div className="flex flex-wrap gap-2">
            {k.followToday > 0 && <Link href="/orders?queue=action" className="flex-1 min-w-[200px] rounded-xl bg-teal-50 border border-teal-200 text-teal-800 px-4 py-3 text-sm font-bold hover:bg-teal-100">{"\uD83D\uDCDE"} आज आपको {fmt(k.followToday)} Follow-up करने हैं &rarr;</Link>}
            {k.overdue > 0 && <Link href="/orders?queue=overdue" className="flex-1 min-w-[200px] rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-semibold hover:bg-red-100">{"\u26A0"} {fmt(k.overdue)} Overdue follow-up &mdash; अभी call करें &rarr;</Link>}
            {k.followTomorrow > 0 && <Link href="/orders?queue=tomorrow" className="flex-1 min-w-[200px] rounded-xl bg-violet-50 border border-violet-200 text-violet-700 px-4 py-3 text-sm font-semibold hover:bg-violet-100">{"\uD83D\uDCC5"} कल {fmt(k.followTomorrow)} follow-up &rarr;</Link>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Daily Trend (Orders)"><Trend rows={data.daily} /></Section>
          <Section title="Order Status"><Bars items={Object.entries(data.byStatus).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} colorFn={sc} /></Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Top Sources"><Bars items={data.source} colorFn={() => "#06b6d4"} /></Section>
          <Section title="Top Products"><Bars items={data.products} colorFn={() => "#8b5cf6"} /></Section>
          <Section title="Top States"><Bars items={data.states} colorFn={() => "#14b8a6"} /></Section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Payment Analysis">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-xl p-3 bg-teal-50"><div className="text-xs text-teal-700">Online Received</div><div className="text-xl font-bold text-teal-800">{rs(data.payment.online)}</div></div>
              <div className="rounded-xl p-3 bg-amber-50"><div className="text-xs text-amber-700">COD Pending</div><div className="text-xl font-bold text-amber-800">{rs(data.payment.codPending)}</div></div>
            </div>
            <Bars items={Object.entries(data.payment.modes).map(([label, value]) => ({ label, value }))} colorFn={() => "#2563eb"} />
          </Section>
          <Section title="Lead Owner Performance">
            {data.leadOwners.length === 0 ? <div className="text-sm text-gray-400">No data</div> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 border-b"><tr><th className="py-1">Owner</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Confirmed</th><th className="py-1 text-right">Revenue</th></tr></thead>
                <tbody>{data.leadOwners.map((l) => (<tr key={l.name} className="border-b last:border-0"><td className="py-1 font-medium text-gray-800">{l.name}</td><td className="py-1 text-right">{fmt(l.orders)}</td><td className="py-1 text-right text-green-700">{fmt(l.confirmed)}</td><td className="py-1 text-right font-semibold">{rs(l.revenue)}</td></tr>))}</tbody>
              </table></div>
            )}
          </Section>
        </div>

        {agentStats && agentStats.agents.length > 0 && (<>
          <Section title="Team Workflow" extra={<span className="text-xs text-gray-400">auto-refresh</span>}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                ["Assigned", agentStats.totals.assigned, "bg-slate-100 text-slate-800"],
                ["Worked", agentStats.totals.worked, "bg-emerald-100 text-emerald-800"],
                ["Untouched", agentStats.totals.untouched, "bg-blue-100 text-blue-800"],
                ["Pending", agentStats.totals.Pending, "bg-amber-100 text-amber-800"],
                ["Callback", agentStats.totals.Callback, "bg-yellow-100 text-yellow-800"],
                ["Confirmed", agentStats.totals.Confirmed, "bg-green-100 text-green-800"],
                ["Cancelled", agentStats.totals.Cancelled, "bg-red-100 text-red-800"],
                ["Shipped", agentStats.totals.Shipped, "bg-orange-100 text-orange-800"],
                ["GPO Done", agentStats.totals["GPO Done"], "bg-violet-100 text-violet-800"],
                ["Overdue", agentStats.totals.overdue, "bg-rose-100 text-rose-800"],
              ].map(([label, val, cls]) => (
                <div key={label as string} className={"rounded-xl p-3 " + (cls as string)}>
                  <div className="text-xl font-extrabold">{fmt(Number(val) || 0)}</div>
                  <div className="text-[11px] font-medium opacity-80">{label as string}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Agent Performance" extra={<span className="text-xs text-gray-400">click a row for detail</span>}>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 border-b"><tr><th className="py-1">Agent</th><th className="py-1 text-right">Assigned</th><th className="py-1 text-right">Worked</th><th className="py-1 text-right">Untouched</th><th className="py-1 text-right">Overdue</th></tr></thead>
              <tbody>
                {agentStats.agents.map((a) => (
                  <Fragment key={a.agentId}>
                    <tr className="border-b last:border-0 cursor-pointer hover:bg-gray-50" onClick={() => setOpenAgent(openAgent === a.agentId ? null : a.agentId)}>
                      <td className="py-1 font-medium text-gray-800">{openAgent === a.agentId ? "\u25BE " : "\u25B8 "}{a.name}</td>
                      <td className="py-1 text-right">{fmt(a.assigned)}</td>
                      <td className="py-1 text-right text-emerald-700">{fmt(a.worked)}</td>
                      <td className="py-1 text-right text-blue-700">{fmt(a.untouched)}</td>
                      <td className="py-1 text-right text-rose-700">{fmt(a.overdue)}</td>
                    </tr>
                    {openAgent === a.agentId && (
                      <tr className="bg-slate-50"><td colSpan={5} className="py-2 px-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {[["New", a.New, "#3b82f6"], ["Confirmed", a.Confirmed, "#22c55e"], ["Callback", a.Callback, "#eab308"], ["Pending", a.Pending, "#f59e0b"], ["Cancelled", a.Cancelled, "#ef4444"], ["Shipped", a.Shipped, "#f97316"], ["GPO Done", a["GPO Done"], "#8b5cf6"], ["Delivered", a.Delivered, "#15803d"]].map(([l, v, c]) => (
                            <Link key={l as string} href={"/orders?leadOwner=" + a.agentId} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold" style={{ borderColor: (c as string) + "55", color: c as string }}>{l as string} <b>{fmt(Number(v) || 0)}</b></Link>
                          ))}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table></div>
          </Section>
        </>)}

        {dealerStats && dealerStats.dealers.length > 0 && (
          <Section title="Dealer Workflow" extra={<span className="text-xs text-gray-400">auto-refresh</span>}>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 border-b"><tr><th className="py-1">Dealer</th><th className="py-1 text-right">Assigned</th><th className="py-1 text-right">Worked</th><th className="py-1 text-right">Untouched</th><th className="py-1 text-right">GPO Pending</th><th className="py-1 text-right">GPO Done</th><th className="py-1 text-right">Delivered</th><th className="py-1 text-right">Cancelled</th><th className="py-1 text-right">Other</th></tr></thead>
              <tbody>
                {dealerStats.dealers.map((d: any) => (
                  <tr key={d.dealerId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-1 font-medium text-gray-800">{d.name}</td>
                    <td className="py-1 text-right">{fmt(d.assigned)}</td>
                    <td className="py-1 text-right text-emerald-700">{fmt(d.worked)}</td>
                    <td className="py-1 text-right text-blue-700">{fmt(d.untouched)}</td>
                    <td className="py-1 text-right text-amber-700">{fmt(d["GPO Pending"])}</td>
                    <td className="py-1 text-right text-violet-700">{fmt(d["GPO Done"])}</td>
                    <td className="py-1 text-right text-green-700">{fmt(d.Delivered)}</td>
                    <td className="py-1 text-right text-rose-700">{fmt(d.Cancelled)}</td>
                    <td className="py-1 text-right text-gray-500">{fmt(d.Other)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className="py-1">TOTAL</td><td className="py-1 text-right">{fmt(dealerStats.totals.assigned)}</td><td className="py-1 text-right text-emerald-700">{fmt(dealerStats.totals.worked)}</td><td className="py-1 text-right text-blue-700">{fmt(dealerStats.totals.untouched)}</td><td className="py-1 text-right text-amber-700">{fmt(dealerStats.totals["GPO Pending"])}</td><td className="py-1 text-right text-violet-700">{fmt(dealerStats.totals["GPO Done"])}</td><td className="py-1 text-right text-green-700">{fmt(dealerStats.totals.Delivered)}</td><td className="py-1 text-right text-rose-700">{fmt(dealerStats.totals.Cancelled)}</td><td className="py-1 text-right text-gray-500">{fmt(dealerStats.totals.Other)}</td></tr>
              </tbody>
            </table></div>
          </Section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Live Orders Feed" extra={<Link href="/orders" className="text-xs text-brand-dark font-semibold">View all</Link>}>
            <div className="divide-y">
              {data.liveFeed.length === 0 ? <div className="text-sm text-gray-400">No orders in range</div> :
                data.liveFeed.map((o) => (
                  <Link key={o.id} href={"/orders/" + o.id} className="flex items-center justify-between py-2 hover:bg-gray-50 px-1 rounded">
                    <div><div className="font-medium text-gray-800">{o.customerName || "-"}</div><div className="text-xs text-gray-400">{o.orderCode} - {tIST(o.dateTime)}</div></div>
                    <div className="text-right"><Badge s={o.status} /><div className="text-xs text-gray-600 mt-1">{rs(o.total)}</div></div>
                  </Link>
                ))}
            </div>
          </Section>
          <Section title={"Follow-ups Due Today (" + data.followList.length + ")"}>
            <div className="divide-y">
              {data.followList.length === 0 ? <div className="text-sm text-gray-400">No follow-ups for today</div> :
                data.followList.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2">
                    <div><div className="font-medium text-gray-800">{r.customerName || "-"}</div><div className="text-xs text-gray-400">{r.orderCode}{r.city ? " - " + r.city : ""}</div></div>
                    <div className="flex items-center gap-2">
                      <Badge s={r.orderStatus} />
                      <a href={tel(r.contactNumber)} className="badge bg-blue-100 text-blue-700">Call</a>
                      <a href={wa(r.contactNumber)} target="_blank" rel="noreferrer" className="badge bg-emerald-100 text-emerald-700">WA</a>
                    </div>
                  </div>
                ))}
            </div>
          </Section>
        </div>
      </>)}
    </div>
  );
}