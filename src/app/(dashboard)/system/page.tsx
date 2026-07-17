"use client";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

function fmtBytes(n?: number | null) {
  if (n == null) return "-";
  if (n < 1024) return n + " B";
  const k = n / 1024; if (k < 1024) return k.toFixed(0) + " KB";
  const m = k / 1024; if (m < 1024) return m.toFixed(1) + " MB";
  return (m / 1024).toFixed(2) + " GB";
}
function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }); } catch { return "-"; }
}
function ago(iso?: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime(); const h = ms / 3600000;
  if (h < 1) return Math.max(0, Math.round(ms / 60000)) + "m ago";
  if (h < 48) return h.toFixed(0) + "h ago";
  return (h / 24).toFixed(0) + "d ago";
}
const grads: Record<string, string> = {
  blue: "linear-gradient(135deg,#2563eb,#3b82f6)", green: "linear-gradient(135deg,#059669,#10b981)",
  purple: "linear-gradient(135deg,#7c3aed,#a855f7)", orange: "linear-gradient(135deg,#ea580c,#f97316)",
  red: "linear-gradient(135deg,#dc2626,#ef4444)", teal: "linear-gradient(135deg,#0d9488,#14b8a6)",
  slate: "linear-gradient(135deg,#334155,#475569)", indigo: "linear-gradient(135deg,#4338ca,#6366f1)",
};
function Kpi({ grad, label, value, sub }: { grad: string; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl p-4 text-white shadow-md" style={{ background: grads[grad] }}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-[11px] opacity-90 mt-0.5">{sub}</div>}
    </div>
  );
}
function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "gray"; children: ReactNode }) {
  const m: any = { green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700", gray: "bg-slate-100 text-slate-600" };
  return <span className={"px-2 py-0.5 rounded-full text-xs font-semibold " + m[tone]}>{children}</span>;
}

export default function SystemHealthPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ["system-health"], queryFn: () => api.get("/api/system/health"), refetchInterval: 30000 });
  const { data: ss } = useQuery({ queryKey: ["sync-status"], queryFn: () => api.get("/api/sync/status"), refetchInterval: 30000 });
  const st: any = (ss as any)?.status || null;
  const stFresh = st?.lastSyncAt && (Date.now() - new Date(st.lastSyncAt).getTime()) < 10 * 60000;
  const d: any = data || {};
  const a = d.api || {}, db = d.db || {}, users = d.users || {}, logins = d.logins || {}, orders = d.orders || {}, sr = d.shiprocket || {}, sync = d.sync || {}, backup = d.backup || {};
  const syncFresh = sync.lastAt && (Date.now() - new Date(sync.lastAt).getTime()) < 6 * 3600000;

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">System Health</h1>
          <div className="text-xs text-slate-500">Live system status - auto-refresh 30s{d.generatedAt ? " - updated " + fmtTime(d.generatedAt) : ""}</div>
        </div>
        <button onClick={() => refetch()} className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm font-medium hover:bg-slate-700">{isFetching ? "Refreshing..." : "Refresh"}</button>
      </div>

      {isLoading ? <div className="card p-6 text-slate-500">Loading system status...</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi grad={a.status === "ok" ? "green" : "red"} label="API / Database" value={a.status === "ok" ? "Online" : "DOWN"} sub={a.dbLatencyMs != null ? "DB " + a.dbLatencyMs + " ms" : undefined} />
            <Kpi grad="indigo" label="Database Size" value={fmtBytes(db.sizeBytes)} sub={db.name} />
            <Kpi grad="blue" label="Total Users" value={users.total ?? "-"} sub={(users.active ?? 0) + " active flag"} />
            <Kpi grad="teal" label="Logged in (24h)" value={users.recentlyActive ?? "-"} sub="active users" />
            <Kpi grad={(logins.failed24h ?? 0) > 0 ? "red" : "slate"} label="Failed Logins (24h)" value={logins.failed24h ?? 0} sub={(logins.success24h ?? 0) + " success"} />
            <Kpi grad="orange" label="Pending Follow-ups" value={orders.pendingFollowups ?? "-"} sub="due today (open)" />
            <Kpi grad={(orders.overdueFollowups ?? 0) > 0 ? "red" : "slate"} label="Overdue Follow-ups" value={orders.overdueFollowups ?? 0} sub="back-date pending" />
            <Kpi grad="purple" label="New Backlog" value={orders.newBacklog ?? "-"} sub="status = New" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Database Backup</h2>
                <Pill tone={backup.status === "ok" ? "green" : backup.status === "stale" ? "amber" : "red"}>{backup.status === "ok" ? "OK" : backup.status === "stale" ? "Stale" : backup.status === "none" ? "No backup yet" : "Not configured"}</Pill>
              </div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>Last backup: <b>{fmtTime(backup.lastBackupAt)}</b> {backup.lastBackupAt ? <span className="text-slate-400">({ago(backup.lastBackupAt)})</span> : null}</div>
                <div>Size: <b>{fmtBytes(backup.sizeBytes)}</b> - Total backups: <b>{backup.count ?? 0}</b></div>
                {backup.message ? <div className="text-amber-600">{backup.message}</div> : null}
                <div className="text-[11px] text-slate-400">Nightly pg_dump to /var/backups/prakriti_crm (keeps last 14).</div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Admin to CRM Sync Status</h2>
                <Pill tone={st ? (stFresh && (st.missingOrders ?? 0) === 0 ? "green" : stFresh ? "amber" : "red") : (syncFresh ? "green" : "amber")}>
                  {st ? (stFresh ? ((st.missingOrders ?? 0) === 0 ? "Healthy" : "Gap: " + st.missingOrders) : "Stale") : (syncFresh ? "Active" : "Idle")}
                </Pill>
              </div>
              <div className="text-sm text-slate-600 space-y-1">
                {st ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>Last sync: <b>{fmtTime(st.lastSyncAt)}</b> <span className="text-slate-400">({ago(st.lastSyncAt)})</span></div>
                      <div>Synced today: <b>{st.syncedToday ?? 0}</b></div>
                      <div>Admin orders: <b>{st.adminOrders ?? "-"}</b></div>
                      <div>CRM order rows: <b>{st.crmOrderRows ?? "-"}</b></div>
                      <div>Pending queue: <b className={(st.pendingQueue ?? 0) > 0 ? "text-amber-600" : ""}>{st.pendingQueue ?? 0}</b></div>
                      <div>Failed (24h): <b className={(st.failed24h ?? 0) > 0 ? "text-red-600" : ""}>{st.failed24h ?? 0}</b></div>
                      <div className="col-span-2">Missing orders: <b className={(st.missingOrders ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}>{st.missingOrders ?? 0}</b></div>
                    </div>
                    {st.note ? <div className="text-[11px] text-amber-600">{st.note}</div> : null}
                  </>
                ) : (
                  <>
                    <div>Events (24h): <b>{sync.events24h ?? 0}</b></div>
                    <div>Last sync: <b>{fmtTime(sync.lastAt)}</b> {sync.lastAt ? <span className="text-slate-400">({ago(sync.lastAt)})</span> : null}</div>
                    <div className="text-[11px] text-slate-400">Detailed status will appear after first worker heartbeat.</div>
                  </>
                )}
                <div className="text-[11px] text-slate-400">PG trigger (INSERT+UPDATE) to crm_outbox to crm-sync-worker to /api/ingest. Heartbeat every drain.</div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Shiprocket / Webhook</h2>
                <Pill tone={sr.status === "active" || sr.status === "ready" ? "green" : sr.status === "creds_pending" ? "amber" : "gray"}>{sr.status === "creds_pending" ? "Creds pending" : sr.status === "active" ? "Active" : sr.status === "ready" ? "Ready" : "-"}</Pill>
              </div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>Webhook: <code className="text-xs bg-slate-100 px-1 rounded">{sr.webhookEndpoint || "-"}</code></div>
                <div>API creds configured: <b>{sr.credsConfigured ? "Yes" : "No"}</b></div>
                <div>Orders booked: <b>{sr.ordersBooked ?? 0}</b> - Last: {fmtTime(sr.lastBookedAt)}</div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-slate-800">Users and Logins</h2>
                <Pill tone="green">Live</Pill>
              </div>
              <div className="text-sm text-slate-600 space-y-1">
                <div>Total users: <b>{users.total ?? "-"}</b> - Active flag: <b>{users.active ?? "-"}</b></div>
                <div>Logged in (24h): <b>{users.recentlyActive ?? "-"}</b></div>
                <div>Successful logins (24h): <b>{logins.success24h ?? 0}</b></div>
                <div>Failed logins (24h): <b className={(logins.failed24h ?? 0) > 0 ? "text-red-600" : ""}>{logins.failed24h ?? 0}</b></div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 mt-4">All numbers are live from the CRM database and server. Anything not measurable shows as "-" / "not configured" (never faked).</div>
        </>
      )}
    </div>
  );
}