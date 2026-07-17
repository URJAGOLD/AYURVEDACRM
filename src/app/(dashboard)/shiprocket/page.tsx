"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

type Account = {
  id: number; label: string; email: string; baseUrl: string | null; pickupLocation: string;
  webhookToken: string | null; isActive: boolean; hasPassword: boolean;
  lastTestAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null; lastSyncAt: string | null;
};
const WEBHOOK_FULL = "https://prakritiherbs.in/crm/api/delivery/notify"; // Clean URL - no blocked keyword
const WEBHOOK_TOKEN_HINT = "B&62i!hvbixXgbbdV40O5ChXNqF&N1u4"; // x-api-key header value
const BLANK = { label: "", email: "", password: "", pickupLocation: "Primary", baseUrl: "", webhookToken: "" };
function fmt(s: string | null) { if (!s) return "-"; return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }


function BackfillSection({ bfFrom, setBfFrom, bfTo, setBfTo, bfDry, setBfDry, bfBusy, bfResult, bfPreview, runPreview, runBackfill }: any) {
  return (
    <div className="mt-8 rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h2 className="mb-1 text-base font-bold text-orange-800">&#128190; Shiprocket Backfill</h2>
      <p className="mb-4 text-xs text-orange-700">Shiprocket Panel ke purane orders CRM mein import karo. <b>Dry Run</b> pehle check karo.</p>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div><label className="label">From Date</label><input type="date" className="input w-40" value={bfFrom} onChange={(e) => setBfFrom(e.target.value)} /></div>
        <div><label className="label">To Date</label><input type="date" className="input w-40" value={bfTo} onChange={(e) => setBfTo(e.target.value)} /></div>
        <div className="flex items-center gap-2 mt-5"><input type="checkbox" id="bfDry" checked={bfDry} onChange={(e) => setBfDry(e.target.checked)} className="rounded" /><label htmlFor="bfDry" className="text-sm font-medium text-orange-800">Dry Run only</label></div>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        <button disabled={bfBusy} onClick={runPreview} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{bfBusy ? "Loading..." : "Preview Page 1"}</button>
        <button disabled={bfBusy} onClick={runBackfill} className={"rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 " + (bfDry ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700")}>{bfBusy ? "Running..." : (bfDry ? "Dry Run Import" : "Import Now")}</button>
      </div>
      {bfPreview && (
        <div className="mb-4 rounded-lg bg-white border border-indigo-100 p-3 text-sm">
          <div className="font-bold text-indigo-700 mb-2">Preview (Page 1)</div>
          {bfPreview.error ? <div className="text-red-600">{bfPreview.error}</div> : (
            <>
              <div className="flex gap-4 mb-2 text-xs">
                <span>Fetched: <b>{bfPreview.sample_count}</b></span>
                <span className="text-green-700">Would Create: <b>{bfPreview.would_create}</b></span>
                <span className="text-gray-500">Already in CRM: <b>{bfPreview.would_skip}</b></span>
              </div>
              <div className="overflow-x-auto"><table className="text-xs w-full min-w-[400px]">
                <thead className="text-gray-400 text-left"><tr><th className="pb-1">SR Order ID</th><th className="pb-1">Customer</th><th className="pb-1">Phone</th><th className="pb-1">Status</th><th className="pb-1">AWB</th></tr></thead>
                <tbody>{(bfPreview.sample || []).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100"><td className="py-1 text-blue-600 font-medium">{r.sr_order_id}</td><td className="py-1">{r.customer}</td><td className="py-1">{r.phone}</td><td className="py-1 text-gray-500">{r.status}</td><td className="py-1 text-emerald-700">{r.awb || "-"}</td></tr>
                ))}</tbody>
              </table></div>
            </>
          )}
        </div>
      )}
      {bfResult && (
        <div className={"rounded-lg border p-3 text-sm " + (bfResult.error ? "bg-red-50 border-red-200" : "bg-white border-emerald-200")}>
          {bfResult.error ? <div className="text-red-600 font-medium">{bfResult.error}</div> : (
            <>
              <div className="font-bold text-emerald-700 mb-2">{bfResult.dry_run ? "Dry Run Results" : "Import Complete"}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-3">
                <div className="rounded bg-indigo-50 p-2 text-center"><div className="text-gray-500">Pages Scanned</div><div className="text-lg font-bold text-indigo-700">{bfResult.pages_scanned}</div></div>
                <div className="rounded bg-gray-50 p-2 text-center"><div className="text-gray-500">SR Fetched</div><div className="text-lg font-bold">{bfResult.total_fetched}</div></div>
                <div className="rounded bg-green-50 p-2 text-center"><div className="text-gray-500">{bfResult.dry_run ? "Would Create" : "Created"}</div><div className="text-lg font-bold text-green-700">{bfResult.created}</div></div>
                <div className="rounded bg-blue-50 p-2 text-center"><div className="text-gray-500">Already in CRM</div><div className="text-lg font-bold text-blue-700">{(bfResult.updated||0) + (bfResult.skipped||0)}</div></div>
                <div className="rounded bg-red-50 p-2 text-center"><div className="text-gray-500">Errors</div><div className="text-lg font-bold text-red-600">{bfResult.errors}</div></div>
              </div>
              {bfResult.created_orders?.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Created (first 10):</div>
                  <div className="flex flex-wrap gap-1">
                    {bfResult.created_orders.slice(0,10).map((o: any) => (
                      <span key={o.orderCode} className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{o.orderCode}</span>
                    ))}
                  </div>
                </div>
              )}
              {bfResult.error_details?.length > 0 && (
                <div><div className="text-xs font-semibold text-red-600 mb-1">Errors:</div>
                <div className="text-xs text-red-600">{bfResult.error_details.slice(0,5).map((e: any) => e.srOrderId + ": " + e.msg).join(" | ")}</div></div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShiprocketPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sr-accounts"], queryFn: () => api.get("/api/shiprocket/accounts") });
  const accounts: Account[] = data?.accounts || [];
  const encReady: boolean = data?.encryptionReady ?? true;

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | string | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [testResult, setTestResult] = useState<Record<number, any>>({});
  const [pickupOpts, setPickupOpts] = useState<Record<number, string[]>>({});
  const [pickupMsg, setPickupMsg] = useState<Record<number, string>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["sr-accounts"] });
  const upd = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  // ── Backfill state ──
  const [bfFrom, setBfFrom] = useState("");
  const [bfTo, setBfTo] = useState("");
  const [bfDry, setBfDry] = useState(true);
  const [bfBusy, setBfBusy] = useState(false);
  const [bfResult, setBfResult] = useState<any>(null);
  const [bfPreview, setBfPreview] = useState<any>(null);
  async function runPreview() {
    setBfBusy(true); setBfPreview(null);
    try { const r = await api.get("/api/shiprocket/backfill"); setBfPreview(r); }
    catch (e: any) { setBfPreview({ error: e.message }); }
    finally { setBfBusy(false); }
  }
  async function runBackfill() {
    if (!bfDry && !window.confirm("Shiprocket se orders CRM mein import karein? Yeh ek baar ka kaam hai.")) return;
    setBfBusy(true); setBfResult(null);
    try {
      const r = await api.post("/api/shiprocket/backfill", { from: bfFrom || undefined, to: bfTo || undefined, dry_run: bfDry, batch_delay_ms: 400 });
      setBfResult(r);
    } catch (e: any) { setBfResult({ error: e.message }); }
    finally { setBfBusy(false); }
  }
  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
  const fld = (label: string, k: string, type = "text", ph = "") => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input className={inputCls} type={type} placeholder={ph} value={form[k] || ""} onChange={(e) => upd(k, e.target.value)} />
    </label>
  );

  async function create() {
    if (!form.label || !form.email || !form.password) return alert("Label, Email, Password zaroori hain");
    setBusy("new");
    try { await api.post("/api/shiprocket/accounts", form); setShowAdd(false); setForm(BLANK); refresh(); }
    catch (e: any) { alert("Save failed: " + (e?.message || e)); } finally { setBusy(null); }
  }
  async function save(id: number) {
    setBusy(id);
    try { await api.put("/api/shiprocket/accounts/" + id, form); setEditId(null); setForm(BLANK); refresh(); }
    catch (e: any) { alert("Update failed: " + (e?.message || e)); } finally { setBusy(null); }
  }
  async function del(id: number) {
    if (!confirm("Yeh Shiprocket account delete karein?")) return;
    setBusy(id);
    try { await api.del("/api/shiprocket/accounts/" + id); refresh(); }
    catch (e: any) { alert("Delete failed: " + (e?.message || e)); } finally { setBusy(null); }
  }
  async function activate(id: number) {
    setBusy(id);
    try { await api.post("/api/shiprocket/accounts/" + id + "/action", { action: "activate" }); refresh(); }
    catch (e: any) { alert("Activate failed: " + (e?.message || e)); } finally { setBusy(null); }
  }
  async function test(id: number) {
    setBusy(id);
    try { const r = await api.post("/api/shiprocket/accounts/" + id + "/action", { action: "test" }); setTestResult((p) => ({ ...p, [id]: r })); if (r?.pickupLocations?.length) setPickupOpts((q) => ({ ...q, [id]: r.pickupLocations.map((x: any) => x.name) })); refresh(); }
    catch (e: any) { setTestResult((p) => ({ ...p, [id]: { ok: false, message: e?.message || String(e) } })); } finally { setBusy(null); }
  }
  async function syncPickup(id: number) {
    setBusy("pk" + id); setPickupMsg((p) => ({ ...p, [id]: "" }));
    try {
      const r = await api.post("/api/shiprocket/accounts/" + id + "/action", { action: "pickup" });
      const names = (r?.pickupLocations || []).map((x: any) => x.name).filter(Boolean);
      setPickupOpts((p) => ({ ...p, [id]: names }));
      setPickupMsg((p) => ({ ...p, [id]: names.length ? ("\u2705 " + names.length + " location(s): " + names.join(", ")) : "No pickup locations found in Shiprocket account" }));
      if (editId === id && names.length && !names.includes(form.pickupLocation)) upd("pickupLocation", names[0]);
    } catch (e: any) { setPickupMsg((p) => ({ ...p, [id]: "Sync failed: " + (e?.message || e) })); }
    finally { setBusy(null); }
  }
  function startEdit(a: Account) { setEditId(a.id); setShowAdd(false); setForm({ label: a.label, email: a.email, password: "", pickupLocation: a.pickupLocation, baseUrl: a.baseUrl || "", webhookToken: a.webhookToken || "" }); }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🚚 Shiprocket Management</h1>
          <p className="text-sm text-gray-500">Multiple accounts · active selection · test · pickup locations</p>
        </div>
        <button onClick={() => { setShowAdd((s) => !s); setEditId(null); setForm(BLANK); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">{showAdd ? "Close" : "+ Add Account"}</button>
      </div>

      {!encReady && (<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠️ Server encryption key (APP_ENCRYPTION_KEY) set nahi hai — account save nahi hoga.</div>)}

      <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-emerald-800">&#128279; Shiprocket Webhook Setup</div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-semibold">CLEAN URL — keyword-free</span>
        </div>
        <div className="mb-3 text-xs text-emerald-700 bg-white rounded-lg p-2 border border-emerald-200">
          <b>&#9888; Note:</b> Shiprocket blocks URLs containing <code>shiprocket</code>, <code>kartrocket</code>, <code>sr</code>, <code>kr</code> keywords. Always use this clean URL.
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-1">URL (copy to Shiprocket Settings → Additional Settings → Webhooks):</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-emerald-800 ring-2 ring-emerald-400 font-bold">{WEBHOOK_FULL}</code>
            <button onClick={() => navigator.clipboard?.writeText(WEBHOOK_FULL)} className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Copy URL</button>
          </div>
        </div>
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Auth Token Type: <b>x-api-key</b> &nbsp;|&nbsp; Token:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white px-2 py-1.5 text-xs text-gray-700 ring-1 ring-gray-300">{WEBHOOK_TOKEN_HINT}</code>
            <button onClick={() => navigator.clipboard?.writeText(WEBHOOK_TOKEN_HINT)} className="shrink-0 rounded-md bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700">Copy Token</button>
          </div>
        </div>
        <div className="text-xs text-emerald-700">
          <b>Steps:</b> Shiprocket → Settings → Additional Settings → Webhooks → Enter above URL + Token → Enable → Save
        </div>
      </div>

      {showAdd && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-800">New Shiprocket Account</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {fld("Label (pehchaan)", "label", "text", "e.g. Main / Backup")}
            {fld("API Email", "email", "text", "shiprocket API user email")}
            {fld("API Password", "password", "password", "API user password")}
            {fld("Pickup Location", "pickupLocation", "text", "Primary")}
            {fld("Base URL (optional)", "baseUrl", "text", "default Shiprocket API")}
            {fld("Webhook Token (optional)", "webhookToken", "text", "")}
          </div>
          <div className="mt-3 flex gap-2">
            <button disabled={busy === "new"} onClick={create} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy === "new" ? "Saving..." : "Save Account"}</button>
            <button onClick={() => { setShowAdd(false); setForm(BLANK); }} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">Cancel</button>
          </div>
          <p className="mt-2 text-xs text-gray-400">Pehla account apne-aap Active hoga. Password encrypted hokar store hota hai.</p>
        </div>
      )}

      {isLoading ? (<div className="py-10 text-center text-sm text-gray-400">Loading...</div>)
      : accounts.length === 0 ? (<div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400">Koi Shiprocket account nahi — upar "+ Add Account" se jodein.</div>)
      : (
        <div className="grid gap-4">
          {accounts.map((a) => (
            <div key={a.id} className={"rounded-xl border bg-white p-4 shadow-sm " + (a.isActive ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-200")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-gray-800">{a.label}</span>
                    {a.isActive ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">● Active</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{a.email}</div>
                  <div className="mt-0.5 text-xs text-gray-400">Pickup: {a.pickupLocation} · Last sync: {fmt(a.lastSyncAt)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy === a.id} onClick={() => test(a.id)} className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">{busy === a.id ? "..." : "Test"}</button>
                  <button disabled={busy === ("pk" + a.id)} onClick={() => syncPickup(a.id)} className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">{busy === ("pk" + a.id) ? "..." : "Sync Pickup"}</button>
                  {!a.isActive && <button disabled={busy === a.id} onClick={() => activate(a.id)} className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Activate</button>}
                  <button onClick={() => startEdit(a)} className="rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                  <button disabled={busy === a.id} onClick={() => del(a.id)} className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">Delete</button>
                </div>
              </div>
              {a.lastTestAt && (<div className="mt-2 text-xs"><span className={a.lastTestOk ? "text-emerald-600" : "text-red-600"}>{a.lastTestOk ? "✓ Connected" : "✗ Failed"} · {fmt(a.lastTestAt)}{a.lastTestMessage ? " · " + a.lastTestMessage : ""}</span></div>)}
              {testResult[a.id] && (
                <div className={"mt-2 rounded-lg p-2 text-xs " + (testResult[a.id].ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                  <div className="font-semibold">{testResult[a.id].ok ? "Connection OK" : "Connection Failed"} — {testResult[a.id].message}</div>
                  {testResult[a.id].pickupLocations?.length > 0 && (<div className="mt-1 text-gray-600">Pickup: {testResult[a.id].pickupLocations.map((p: any) => p.name + (p.pin ? " (" + p.pin + ")" : "")).join(", ")}</div>)}
                </div>
              )}
              {pickupMsg[a.id] && (<div className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700">{pickupMsg[a.id]}</div>)}
              {editId === a.id && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {fld("Label", "label")}
                    {fld("API Email", "email")}
                    {fld("New Password (khaali = wahi rahega)", "password", "password", "leave blank to keep")}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">Pickup Location</span>
                      {pickupOpts[a.id]?.length ? (
                        <select className={inputCls} value={form.pickupLocation || ""} onChange={(e) => upd("pickupLocation", e.target.value)}>
                          {form.pickupLocation && !pickupOpts[a.id].includes(form.pickupLocation) && <option value={form.pickupLocation}>{form.pickupLocation} (current)</option>}
                          {pickupOpts[a.id].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (
                        <input className={inputCls} value={form.pickupLocation || ""} onChange={(e) => upd("pickupLocation", e.target.value)} placeholder="Sync Pickup se list laayein" />
                      )}
                      <button type="button" disabled={busy === ("pk" + a.id)} onClick={() => syncPickup(a.id)} className="mt-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">{busy === ("pk" + a.id) ? "Syncing..." : "\u21BB Sync Pickup Locations"}</button>
                    </label>
                    {fld("Base URL (optional)", "baseUrl")}
                    {fld("Webhook Token (optional)", "webhookToken")}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy === a.id} onClick={() => save(a.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Save</button>
                    <button onClick={() => { setEditId(null); setForm(BLANK); }} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Backfill Section */}
      <BackfillSection bfFrom={bfFrom} setBfFrom={setBfFrom} bfTo={bfTo} setBfTo={setBfTo} bfDry={bfDry} setBfDry={setBfDry} bfBusy={bfBusy} bfResult={bfResult} bfPreview={bfPreview} runPreview={runPreview} runBackfill={runBackfill} />

      <p className="mt-6 text-xs text-gray-400">Package dimensions & courier-selection booking Phase 2 me aayenge (abhi server defaults + auto-courier).</p>
    </div>
  );
}