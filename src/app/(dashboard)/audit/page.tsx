"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

const MOD: Record<string, { label: string; tone: string }> = {
  auth: { label: "Auth", tone: "indigo" }, order: { label: "Order", tone: "blue" },
  user: { label: "User", tone: "purple" }, shiprocket: { label: "Shipping", tone: "teal" },
  master: { label: "Master", tone: "amber" },
};
const VERB: Record<string, string> = {
  login: "Logged in", login_failed: "Login FAILED", logout: "Logged out",
  create: "Created", update: "Updated", delete: "Deleted",
  bulkStatus: "Bulk status change", bulkAssign: "Bulk assign/unassign", bulkDelete: "Bulk delete",
  import: "Import", smartImport: "Smart import", book: "Shiprocket booked",
  cancel: "Shiprocket cancelled", pickup: "Pickup requested", deactivate: "Deactivated", "source.add": "Source added",
};
function meta(action: string) {
  const i = action.indexOf(".");
  const mod = i > 0 ? action.slice(0, i) : action;
  const verb = i > 0 ? action.slice(i + 1) : "";
  const m = MOD[mod] || { label: mod || "-", tone: "slate" };
  const label = VERB[verb] || (verb ? verb.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : action);
  return { module: m.label, tone: m.tone, label };
}
const toneBg: Record<string, string> = {
  indigo: "bg-indigo-100 text-indigo-700", blue: "bg-blue-100 text-blue-700", purple: "bg-purple-100 text-purple-700",
  teal: "bg-teal-100 text-teal-700", amber: "bg-amber-100 text-amber-700", slate: "bg-slate-100 text-slate-600", red: "bg-red-100 text-red-700",
};
function fmt(iso?: string | null) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }); } catch { return "-"; }
}
function ago(iso?: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime(), h = ms / 3600000;
  if (h < 1) return Math.max(0, Math.round(ms / 60000)) + "m ago";
  if (h < 48) return h.toFixed(0) + "h ago";
  return (h / 24).toFixed(0) + "d ago";
}
const LENSES = [{ key: "", label: "All" }, { key: "security", label: "Security" }, { key: "data", label: "Data Changes" }, { key: "shipping", label: "Shipping" }];
const EMPTY = { from: "", to: "", userId: "", action: "", lens: "", q: "" };

// ─── Rollback eligibility (mirror of backend rules) ───
const RB_ACTIONS = new Set(["order.update", "order.delete", "order.bulkAssign", "order.bulkStatus", "order.bulkDelete", "user.update"]);
const RB_BLOCKED = ["shiprocket.", "auth.", "rollback."];
function canRollback(e: any): { ok: boolean; reason?: string } {
  if (!e?.action) return { ok: false };
  if (RB_BLOCKED.some((p) => e.action.startsWith(p))) return { ok: false, reason: "Shipment/security events rollback nahi ho sakte" };
  if (!RB_ACTIONS.has(e.action)) return { ok: false };
  const d = e.details || {};
  if (e.action === "order.delete" || e.action === "order.bulkDelete") return { ok: true };
  if (e.action === "order.bulkAssign" || e.action === "order.bulkStatus") {
    return Array.isArray(d?.before?.perOrder) && d.before.perOrder.length > 0 ? { ok: true } : { ok: false, reason: "Purane log mein before-state nahi hai" };
  }
  // order.update / user.update
  return d?.before && Object.keys(d.before).length > 0 ? { ok: true } : { ok: false, reason: "Purane log mein before-state nahi hai" };
}
function affectedCount(e: any): number {
  const d = e?.details || {};
  if (Array.isArray(d?.before?.perOrder)) return d.before.perOrder.length;
  if (Array.isArray(d?.ids)) return d.ids.length;
  return 1;
}
function isDeleteAction(a: string) { return a === "order.delete" || a === "order.bulkDelete"; }

export default function AuditLogPage() {
  const [filters, setFilters] = useState<any>({ ...EMPTY });
  const [applied, setApplied] = useState<any>({ ...EMPTY });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<any>(null);
  const qc = useQueryClient();
  const [rbConfirm, setRbConfirm] = useState<any>(null); // entry pending confirmation
  const [rbBusy, setRbBusy] = useState(false);
  const [rbMsg, setRbMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // ── Dependency detection ──────────────────────────────────────────────
  const [deps, setDeps] = useState<any>(null);        // { dependencies:[], affectedIds:[] }
  const [depsLoading, setDepsLoading] = useState(false);
  const [chainModal, setChainModal] = useState<any>(null); // entry pending chain decision
  const [chainMode, setChainMode] = useState<"assignment_only"|"full_chain">("assignment_only");

  // Fetch deps whenever a rollback-eligible entry is selected
  useEffect(() => {
    const rb = canRollback(sel);
    if (!sel || !rb.ok) { setDeps(null); return; }
    let alive = true;
    setDepsLoading(true); setDeps(null);
    api.get("/api/audit/dependencies?auditId=" + sel.id)
      .then((d: any) => { if (alive) setDeps(d); })
      .catch(() => { if (alive) setDeps(null); })
      .finally(() => { if (alive) setDepsLoading(false); });
    return () => { alive = false; };
  }, [sel?.id]);

  async function doRollback(entry: any, mode?: string) {
    setRbBusy(true); setRbMsg(null);
    try {
      const r = await api.post("/api/audit/rollback", { auditId: entry.id, chainMode: mode ?? chainMode });
      setRbMsg({ ok: true, text: "\u2705 Rollback successful \u2014 " + (r.affected ?? 0) + " record(s) restored. " + (r.note || "") });
      qc.invalidateQueries({ queryKey: ["audit"] }); qc.invalidateQueries({ queryKey: ["audit-summary"] });
      setRbConfirm(null); setChainModal(null); setDeps(null);
    } catch (e: any) {
      setRbMsg({ ok: false, text: e?.message || "Rollback failed" });
      setRbConfirm(null); setChainModal(null);
    } finally { setRbBusy(false); }
  }
  function openRollbackFlow(entry: any) {
    setRbMsg(null);
    // If there are dependencies, show chain-warning modal first
    if (deps && deps.dependencies && deps.dependencies.length > 0) {
      setChainModal(entry);
    } else {
      setRbConfirm(entry);
    }
  }

  const { data: sum } = useQuery({ queryKey: ["audit-summary"], queryFn: () => api.get("/api/audit/summary") });
  const qs = new URLSearchParams();
  Object.entries(applied).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  qs.set("page", String(page)); qs.set("pageSize", "50");
  const { data, isLoading, isFetching } = useQuery({ queryKey: ["audit", qs.toString()], queryFn: () => api.get("/api/audit?" + qs.toString()) });

  const counts = sum?.counts || {}, actions = sum?.actions || [], users = sum?.users || [];
  const rows = data?.rows || [], total = data?.total ?? 0, pages = data?.pages ?? 1;

  const set = (k: string, v: string) => setFilters((f: any) => ({ ...f, [k]: v }));
  function closeSel() { setSel(null); setDeps(null); setRbMsg(null); setChainModal(null); setRbConfirm(null); setChainMode("assignment_only"); }
  const apply = () => { setPage(1); setApplied({ ...filters }); };
  const reset = () => { setFilters({ ...EMPTY }); setApplied({ ...EMPTY }); setPage(1); };
  const setLens = (k: string) => { const nf = { ...filters, lens: k, action: "" }; setFilters(nf); setApplied({ ...nf }); setPage(1); };
  const exportCsv = () => { const e = new URLSearchParams(); Object.entries(applied).forEach(([k, v]) => { if (v) e.set(k, String(v)); }); e.set("format", "csv"); api.download("/api/audit?" + e.toString(), "audit-logs.csv"); };
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Audit Logs</h1>
          <div className="text-xs text-slate-500">Har CRM activity ka tamper-proof record (read-only) - IST{isFetching ? " - refreshing..." : ""}</div>
        </div>
        <button onClick={exportCsv} className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700">Export CSV</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card p-3"><div className="text-[11px] text-slate-500">Total events</div><div className="text-2xl font-extrabold text-slate-800">{counts.total ?? "-"}</div></div>
        <div className="card p-3"><div className="text-[11px] text-slate-500">Today</div><div className="text-2xl font-extrabold text-blue-600">{counts.today ?? "-"}</div></div>
        <div className="card p-3"><div className="text-[11px] text-slate-500">Failed logins (24h)</div><div className={"text-2xl font-extrabold " + ((counts.failed24h ?? 0) > 0 ? "text-red-600" : "text-slate-800")}>{counts.failed24h ?? "-"}</div></div>
        <div className="card p-3"><div className="text-[11px] text-slate-500">Deletes (24h)</div><div className={"text-2xl font-extrabold " + ((counts.deletes24h ?? 0) > 0 ? "text-amber-600" : "text-slate-800")}>{counts.deletes24h ?? "-"}</div></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {LENSES.map((l) => (
          <button key={l.key} onClick={() => setLens(l.key)} className={"px-3 py-1.5 rounded-full text-sm font-medium " + (applied.lens === l.key ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")}>{l.label}</button>
        ))}
      </div>

      <div className="card p-3 mb-4 flex flex-wrap items-end gap-2">
        <div><label className="block text-[11px] text-slate-500 mb-0.5">From</label><input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-[11px] text-slate-500 mb-0.5">To</label><input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div><label className="block text-[11px] text-slate-500 mb-0.5">User</label>
          <select value={filters.userId} onChange={(e) => set("userId", e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm min-w-[140px]">
            <option value="">All users</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select></div>
        <div><label className="block text-[11px] text-slate-500 mb-0.5">Action</label>
          <select value={filters.action} onChange={(e) => set("action", e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm min-w-[160px]">
            <option value="">All actions</option>
            {actions.map((a: any) => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
          </select></div>
        <div className="flex-1 min-w-[140px]"><label className="block text-[11px] text-slate-500 mb-0.5">Search</label><input value={filters.q} onChange={(e) => set("q", e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} placeholder="action / id..." className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
        <button onClick={apply} className="rounded-lg bg-slate-800 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">Apply</button>
        <button onClick={reset} className="rounded-lg bg-white border border-slate-200 text-slate-600 px-3 py-1.5 text-sm hover:bg-slate-50">Reset</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-3 py-2">Time (IST)</th><th className="text-left px-3 py-2">User</th><th className="text-left px-3 py-2">Module</th><th className="text-left px-3 py-2">Action</th><th className="text-left px-3 py-2">Target</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No log entries for these filters.</td></tr>
              ) : rows.map((r: any) => {
                const m = meta(r.action);
                return (
                  <tr key={r.id} onClick={() => setSel(r)} className="border-t border-slate-100 hover:bg-emerald-50/40 cursor-pointer">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmt(r.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.user?.name || (r.userId ? "#" + r.userId : "System")}<span className="text-[11px] text-slate-400"> - {r.user?.role || "-"}</span></td>
                    <td className="px-3 py-2"><span className={"px-2 py-0.5 rounded-full text-[11px] font-semibold " + (toneBg[m.tone] || toneBg.slate)}>{m.module}</span></td>
                    <td className="px-3 py-2 font-medium text-slate-700">{m.label}{r.action === "auth.login_failed" ? <span className="ml-1 text-[10px] px-1 rounded bg-red-100 text-red-700">FAILED</span> : null}</td>
                    <td className="px-3 py-2 text-slate-500">{r.entityType ? r.entityType + (r.entityId ? " #" + r.entityId : "") : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-sm text-slate-500">
          <div>{total} entries - page {page}/{pages || 1}</div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      </div>

      {sel ? (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeSel} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl overflow-y-auto">
            {(() => { const m = meta(sel.action); return (
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div><div className="text-xs text-slate-400">Audit entry #{sel.id}</div><h2 className="text-lg font-extrabold text-slate-800">{m.module} - {m.label}</h2></div>
                  <button onClick={closeSel} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">\u2715</button>
                </div>
                <div className="space-y-3 text-sm">
                  <div><div className="text-[11px] text-slate-400">When (IST)</div><div className="font-medium text-slate-700">{fmt(sel.createdAt)} <span className="text-slate-400">({ago(sel.createdAt)})</span></div></div>
                  <div><div className="text-[11px] text-slate-400">Who</div><div className="font-medium text-slate-700">{sel.user?.name || (sel.userId ? "#" + sel.userId : "System")} - {sel.user?.role || "-"}</div>{sel.user?.email ? <div className="text-xs text-slate-400">{sel.user.email}</div> : null}</div>
                  <div><div className="text-[11px] text-slate-400">Action</div><div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded inline-block">{sel.action}</div></div>
                  <div><div className="text-[11px] text-slate-400">Target</div><div className="font-medium text-slate-700">{sel.entityType ? sel.entityType + (sel.entityId ? " #" + sel.entityId : "") : "-"}{sel.entityType === "order" && /^\d+$/.test(String(sel.entityId || "")) ? <Link href={"/orders/" + sel.entityId} className="ml-2 text-emerald-600 hover:underline text-xs">View order</Link> : null}</div></div>
                  <div><div className="text-[11px] text-slate-400">Details</div><pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{sel.details ? JSON.stringify(sel.details, null, 2) : "(none)"}</pre></div>
                  {(() => { const rb = canRollback(sel); const del = isDeleteAction(sel.action);
                    return rb.ok ? (
                      <div className="pt-2 border-t">
                        <button onClick={() => openRollbackFlow(sel)} className={"w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white " + (del ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-500 hover:bg-orange-600")}>
                          {del ? "\u267B Restore Deleted Record" : "\u21A9 Rollback Action"}
                        </button>
                        <div className="mt-1 text-[10px] text-slate-400 text-center">
                          Super Admin only \u2014 {affectedCount(sel)} record(s) affected
                          {depsLoading ? <span className="ml-1 text-yellow-500">\u23F3 checking deps\u2026</span> : deps && deps.dependencies?.length > 0 ? <span className="ml-1 text-orange-400 font-semibold">\u26A0 {deps.dependencies.length} dependent action(s)</span> : deps ? <span className="ml-1 text-emerald-500">\u2713 no conflicts</span> : null}
                        </div>
                      </div>
                    ) : rb.reason ? (
                      <div className="pt-2 border-t text-[11px] text-slate-400">{"\u26A0 "}{rb.reason}</div>
                    ) : null; })()}
                  {rbMsg ? <div className={"rounded-lg p-2 text-xs font-medium " + (rbMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200")}>{rbMsg.text}</div> : null}
                  {deps && deps.dependencies?.length > 0 ? (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                      <div className="text-xs font-bold text-orange-700 mb-1.5">\u26A0 Affected By Later Actions ({deps.dependencies.length})</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {deps.dependencies.map((d: any) => (
                          <div key={d.id} className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono font-bold text-orange-600">#{d.id}</span>
                            <span className="text-orange-500">{d.action}</span>
                            <span className="text-slate-400">&middot; {d.overlapCount} order(s)</span>
                            {d.afterSummary ? <span className="text-slate-500">&middot; {d.afterSummary.slice(0,40)}</span> : null}
                          </div>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[10px] text-orange-500">Rollback karoge to option milega: Sirf Assignment / Full Chain</div>
                    </div>
                  ) : null}
                  <div className="text-[11px] text-slate-400 pt-2 border-t">This record is read-only and cannot be edited or deleted.</div>
                </div>
              </div>
            ); })()}
          </div>
        </>
      ) : null}

{/* ─── Chain Warning Modal ─── */}
      {chainModal ? (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => !rbBusy && setChainModal(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[92%] max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{"\u26A0"}</span>
              <h3 className="text-lg font-extrabold text-orange-700">This action has newer dependent changes.</h3>
            </div>
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 mb-4">
              <div className="text-xs font-bold text-orange-700 mb-1">Later audits affected same orders:</div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {(deps?.dependencies || []).map((d: any) => (
                  <div key={d.id} className="text-[11px] flex gap-2">
                    <span className="font-mono font-bold text-orange-600">#{d.id}</span>
                    <span className="text-slate-600">{d.action}</span>
                    <span className="text-slate-400">{d.overlapCount} orders</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2 mb-4">
              <div className="text-xs font-bold text-slate-700 mb-1">Rollback mode choose karo:</div>
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border p-2.5 hover:bg-slate-50">
                <input type="radio" name="cm" value="assignment_only" checked={chainMode==="assignment_only"} onChange={() => setChainMode("assignment_only")} className="mt-0.5"/>
                <div><div className="text-sm font-semibold text-slate-700">1. Rollback Only Assignment</div><div className="text-[11px] text-slate-500">Sirf is entry ka assignment revert hoga. Baad ke changes remain.</div></div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border p-2.5 hover:bg-slate-50">
                <input type="radio" name="cm" value="full_chain" checked={chainMode==="full_chain"} onChange={() => setChainMode("full_chain")} className="mt-0.5"/>
                <div><div className="text-sm font-semibold text-slate-700">2. Rollback Entire Chain</div><div className="text-[11px] text-slate-500">Is entry + {(deps?.dependencies||[]).length} baad ke entries — sab revert hoga.</div></div>
              </label>
            </div>
            <div className="flex gap-2">
              <button disabled={rbBusy} onClick={() => doRollback(chainModal, chainMode)} className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{rbBusy ? "Rolling back..." : "Confirm Rollback"}</button>
              <button disabled={rbBusy} onClick={() => setChainModal(null)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </>
      ) : null}

      {/* ─── Rollback Safety Modal (no deps / direct confirm) ─── */}
      {rbConfirm ? (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => !rbBusy && setRbConfirm(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[92%] max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{"\u26A0"}</span>
              <h3 className="text-lg font-extrabold text-slate-800">Warning</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">You are about to revert this action.</p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1.5 mb-4">
              <div className="flex justify-between"><span className="text-slate-400 text-xs">Original Action</span><span className="font-mono text-xs font-bold text-slate-700">{rbConfirm.action}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-xs">Affected Records</span><span className="font-bold text-orange-600">{affectedCount(rbConfirm)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-xs">Originally By</span><span className="text-xs font-medium text-slate-700">{rbConfirm.user?.name || "System"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-xs">Audit Entry</span><span className="text-xs text-slate-700">#{rbConfirm.id}</span></div>
            </div>
            <div className="flex gap-2">
              <button disabled={rbBusy} onClick={() => doRollback(rbConfirm)} className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{rbBusy ? "Rolling back..." : "Confirm Rollback"}</button>
              <button disabled={rbBusy} onClick={() => setRbConfirm(null)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Cancel</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}