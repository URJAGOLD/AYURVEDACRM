"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/apiClient";

type Src = { id: number; name: string; isActive: boolean };
type StItem = { name: string; color: string; enabled: boolean; core: boolean };
type Dlr = { id: number; name: string; city: string | null; isActive: boolean };

const SC: Record<string, string> = {
  "New": "#3b82f6", "Confirmed": "#16a34a", "Confirm Pending": "#f59e0b", "Pending": "#f59e0b",
  "Callback": "#8b5cf6", "Future Delivery": "#0ea5e9", "In Transit": "#0891b2", "Delivered": "#15803d",
  "GPO": "#6366f1", "GPO Pending": "#a16207", "GPO Done": "#16a34a", "GPO Delivered": "#15803d",
  "Cancelled": "#dc2626", "Final cancel": "#dc2626", "Confirm cancel": "#ef4444", "Cancel pending": "#f97316",
  "Dealer Cancel": "#b91c1c", "UNA": "#64748b", "RTO": "#e11d48",
};
const TABS = [
  { k: "sources", label: "Sources" },
  { k: "statuses", label: "Statuses" },
  { k: "followup", label: "Follow-up Rules" },
  { k: "assignment", label: "Assignment" },
  { k: "preferences", label: "CRM Preferences" },
  { k: "dealers", label: "Dealers" },
  { k: "trash", label: "Trash" },
];

function Locked({ phase, points }: { phase: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 mb-3">LOCK {phase}</div>
      <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">{points.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("sources");
  const [sources, setSources] = useState<Src[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [stFull, setStFull] = useState<StItem[] | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [prefs, setPrefs] = useState<any>(null);
  const [fu, setFu] = useState<any>(null);
  const [defs, setDefs] = useState<any>(null);

  const isSA = user?.role === "SUPER_ADMIN";

  async function loadSources() {
    setLoading(true);
    try { const r = await api.get("/api/masters/sources?all=1"); setSources(r.sources || []); }
    catch (e: any) { setMsg(e.message || "load failed"); }
    finally { setLoading(false); }
  }
  async function loadStatuses() {
    try {
      const r = await api.get("/api/masters/statuses");
      setStatuses(r.statuses || []);
      setStFull(Array.isArray(r.full) && r.full.length
        ? r.full
        : (r.statuses || []).map((n: string) => ({ name: n, color: SC[n] || "#94a3b8", enabled: true, core: true })));
    } catch {}
  }

  // ---- Statuses editor (Phase 2B-2): Add / Color / Reorder / Enable-Disable; Rename = custom only ----
  function stUpdate(i: number, patch: Partial<StItem>) {
    if (!stFull) return;
    setStFull(stFull.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function stMove(i: number, dir: -1 | 1) {
    if (!stFull) return;
    const j = i + dir; if (j < 0 || j >= stFull.length) return;
    const a = [...stFull]; [a[i], a[j]] = [a[j], a[i]]; setStFull(a);
  }
  function stRename(i: number) {
    if (!stFull) return; const s = stFull[i];
    if (s.core) { setMsg("ERR Core status ka naam locked hai (reports/revenue ki suraksha ke liye)"); return; }
    const nm = window.prompt("New name:", s.name); if (nm == null) return;
    const t = nm.trim(); if (!t || t === s.name) return;
    if (stFull.some((x, j) => j !== i && x.name.toLowerCase() === t.toLowerCase())) { setMsg("ERR Is naam ka status pehle se hai"); return; }
    stUpdate(i, { name: t.slice(0, 40) });
  }
  function stAdd() {
    const t = newStatus.trim(); if (!t || !stFull) return;
    if (stFull.some((x) => x.name.toLowerCase() === t.toLowerCase())) { setMsg("ERR Is naam ka status pehle se hai"); return; }
    setStFull([...stFull, { name: t.slice(0, 40), color: "#94a3b8", enabled: true, core: false }]);
    setNewStatus(""); setMsg("");
  }
  async function saveStatuses() {
    if (!stFull) return;
    setBusy(true); setMsg("");
    try { await api.put("/api/settings/crm", { statuses: stFull }); setMsg("OK Statuses saved"); await loadStatuses(); }
    catch (e: any) { setMsg("ERR " + (e.message || "save failed")); }
    finally { setBusy(false); }
  }

  // ---- Dealers editor (Phase 3B): Add / Rename / City / Enable-Disable. Rename safe (orders link by id). ----
  const [dealers, setDealers] = useState<Dlr[] | null>(null);
  const [newDealer, setNewDealer] = useState("");
  const [newDealerCity, setNewDealerCity] = useState("");
  async function loadDealers() {
    try { const r = await api.get("/api/masters/dealers?all=1"); setDealers(r.dealers || []); } catch {}
  }
  async function addDealer() {
    const nm = newDealer.trim(); if (!nm) return;
    setBusy(true); setMsg("");
    try { await api.post("/api/masters/dealers", { name: nm, city: newDealerCity.trim() || undefined }); setNewDealer(""); setNewDealerCity(""); setMsg("OK Dealer added: " + nm); await loadDealers(); }
    catch (e: any) { setMsg("ERR " + (e.message || "add failed")); }
    finally { setBusy(false); }
  }
  async function renameDealer(d: Dlr) {
    const nm = window.prompt("New name:", d.name); if (nm == null) return;
    const t = nm.trim(); if (!t || t === d.name) return;
    setBusy(true); setMsg("");
    try { await api.put("/api/masters/dealers", { id: d.id, name: t }); setMsg("OK Rename: " + d.name + " -> " + t); await loadDealers(); }
    catch (e: any) { setMsg("ERR " + (e.message || "rename failed")); }
    finally { setBusy(false); }
  }
  async function cityDealer(d: Dlr) {
    const c = window.prompt("City (khaali = hatayein):", d.city || ""); if (c == null) return;
    setBusy(true); setMsg("");
    try { await api.put("/api/masters/dealers", { id: d.id, city: c.trim() || null }); await loadDealers(); }
    catch (e: any) { setMsg("ERR " + (e.message || "update failed")); }
    finally { setBusy(false); }
  }
  async function toggleDealer(d: Dlr) {
    if (d.isActive && !window.confirm("'" + d.name + "' ko Disable karein? (naye orders me nahi dikhega, purane orders safe)")) return;
    setBusy(true); setMsg("");
    try { await api.put("/api/masters/dealers", { id: d.id, isActive: !d.isActive }); await loadDealers(); }
    catch (e: any) { setMsg("ERR " + (e.message || "update failed")); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (isSA) { loadSources(); loadStatuses(); loadCrm(); loadDealers(); } }, [isSA]);

  async function addSource() {
    const nm = newName.trim(); if (!nm) return;
    setBusy(true); setMsg("");
    try { await api.post("/api/masters/sources", { name: nm }); setNewName(""); setMsg("OK Source added: " + nm); await loadSources(); }
    catch (e: any) { setMsg("ERR " + (e.message || "add failed")); }
    finally { setBusy(false); }
  }
  async function renameSource(s: Src) {
    const nm = window.prompt("New name (orders bhi update honge):", s.name); if (nm == null) return;
    const t = nm.trim(); if (!t || t === s.name) return;
    setBusy(true); setMsg("");
    try { const r = await api.put("/api/masters/sources", { id: s.id, name: t }); setMsg("OK Rename: " + s.name + " -> " + t + " (orders: " + (r.ordersMoved ?? 0) + ")"); await loadSources(); }
    catch (e: any) { setMsg("ERR " + (e.message || "rename failed")); }
    finally { setBusy(false); }
  }
  async function toggleSource(s: Src) {
    if (s.isActive && !window.confirm("'" + s.name + "' ko Disable karein? (naye orders me nahi dikhega, purane orders safe)")) return;
    setBusy(true); setMsg("");
    try { await api.put("/api/masters/sources", { id: s.id, isActive: !s.isActive }); await loadSources(); }
    catch (e: any) { setMsg("ERR " + (e.message || "update failed")); }
    finally { setBusy(false); }
  }
  async function mergeSources() {
    if (!fromId || !toId || fromId === toId) { setMsg("ERR do alag sources chunein"); return; }
    const from = sources.find((x) => String(x.id) === fromId); const to = sources.find((x) => String(x.id) === toId);
    if (!from || !to) return;
    if (!window.confirm("'" + from.name + "' ke sabhi orders '" + to.name + "' me move honge aur '" + from.name + "' disable ho jayega. Aage badhein?")) return;
    setBusy(true); setMsg("");
    try { const r = await api.post("/api/masters/sources/merge", { fromId: Number(fromId), toId: Number(toId) }); setMsg("OK Merge: " + r.ordersMoved + " orders -> '" + r.to + "'"); setFromId(""); setToId(""); await loadSources(); }
    catch (e: any) { setMsg("ERR " + (e.message || "merge failed")); }
    finally { setBusy(false); }
  }

  async function loadCrm() {
    try { const r = await api.get("/api/settings/crm"); setPrefs(r.preferences); setFu(r.followup); setDefs(r.defaults); }
    catch (e: any) { setMsg("ERR settings load: " + (e.message || "")); }
  }
  async function savePrefs() {
    setBusy(true); setMsg("");
    try { const r = await api.put("/api/settings/crm", { preferences: prefs }); setPrefs(r.preferences); setMsg("OK Preferences saved"); }
    catch (e: any) { setMsg("ERR " + (e.message || "save failed")); }
    finally { setBusy(false); }
  }
  async function saveFu() {
    setBusy(true); setMsg("");
    try { const r = await api.put("/api/settings/crm", { followup: fu }); setFu(r.followup); setMsg("OK Follow-up rules saved"); }
    catch (e: any) { setMsg("ERR " + (e.message || "save failed")); }
    finally { setBusy(false); }
  }

  if (!isSA) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="text-3xl mb-2">LOCK</div>
          <div className="font-bold text-red-700 text-lg">Access Restricted</div>
          <div className="text-sm text-red-600 mt-1">Settings sirf SUPER_ADMIN ke liye hai. Aapki role: {user?.role || "-"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-slate-800">Settings - CRM Control Center</h1>
        <p className="text-sm text-slate-500">Bina developer ke badalne yogya sabhi configuration yahin se. (Sirf SUPER_ADMIN)</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={"px-3 py-1.5 rounded-lg text-sm font-medium transition " + (tab === t.k ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200")}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 text-sm rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-slate-700">{msg}</div>}

      {tab === "sources" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="font-semibold text-slate-700 mb-2">Add new Source</div>
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="jaise WhatsApp, Facebook, Dealer..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") addSource(); }} />
              <button disabled={busy} onClick={addSource} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Add</button>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-700 text-sm">Sabhi Sources ({sources.length})</div>
            {loading ? <div className="p-4 text-sm text-slate-400">Load ho raha hai...</div> : (
              <div className="divide-y divide-slate-100">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={"h-2 w-2 rounded-full " + (s.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                      <span className={"text-sm font-medium " + (s.isActive ? "text-slate-800" : "text-slate-400 line-through")}>{s.name}</span>
                      {!s.isActive && <span className="text-[11px] text-slate-400">(disabled)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button disabled={busy} onClick={() => renameSource(s)} className="text-xs rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">Rename</button>
                      <button disabled={busy} onClick={() => toggleSource(s)} className={"text-xs rounded-md px-2 py-1 " + (s.isActive ? "text-amber-700 border border-amber-200 hover:bg-amber-50" : "text-emerald-700 border border-emerald-200 hover:bg-emerald-50")}>{s.isActive ? "Disable" : "Enable"}</button>
                    </div>
                  </div>
                ))}
                {sources.length === 0 && <div className="p-4 text-sm text-slate-400">koi source nahi</div>}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="font-semibold text-slate-700 mb-2">Duplicate Source Cleanup (Merge)</div>
            <p className="text-xs text-slate-500 mb-3">Ek source ke sabhi orders dusre me move karein. Purana source disable ho jayega (delete nahi).</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">From (purana)...</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-slate-400">-&gt;</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">To (mukhya)...</option>
                {sources.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button disabled={busy} onClick={mergeSources} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Merge</button>
            </div>
          </div>
        </div>
      )}

      {tab === "statuses" && (
        <div className="space-y-4">
          {!stFull ? <div className="text-sm text-slate-400">Load ho raha hai...</div> : (
          <>
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="font-semibold text-slate-700 mb-1">Order Statuses ({stFull.length})</div>
            <p className="text-xs text-slate-500 mb-3">
              Color, Order (&#9650;&#9660;) aur Enable/Disable sabhi par chalega. <b>Rename sirf custom statuses par</b> &mdash; core statuses ke naam locked hain (reports/revenue inhi naamon par chalte hain).
              Disable karne par status naye orders ke dropdown me nahi dikhega; purane orders puri tarah surakshit rahenge.
            </p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
              {stFull.map((s, i) => (
                <div key={i + ":" + s.name} className="flex items-center gap-2 px-3 py-2 bg-white">
                  <div className="flex flex-col">
                    <button disabled={busy || i === 0} onClick={() => stMove(i, -1)} className="text-[10px] leading-none px-1 py-0.5 text-slate-500 hover:text-slate-900 disabled:opacity-30">&#9650;</button>
                    <button disabled={busy || i === stFull.length - 1} onClick={() => stMove(i, 1)} className="text-[10px] leading-none px-1 py-0.5 text-slate-500 hover:text-slate-900 disabled:opacity-30">&#9660;</button>
                  </div>
                  <input type="color" value={s.color} onChange={(e) => stUpdate(i, { color: e.target.value })} className="h-7 w-9 rounded border border-slate-200 cursor-pointer shrink-0" title="Color badlein" />
                  <span className={"flex-1 text-sm font-medium truncate " + (s.enabled ? "text-slate-800" : "text-slate-400 line-through")}>
                    {s.name}
                    {s.core && <span title="Core status - naam locked" className="ml-1.5 text-[10px] align-middle rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-500">core</span>}
                  </span>
                  {!s.core && <button disabled={busy} onClick={() => stRename(i)} className="text-xs rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">Rename</button>}
                  <button disabled={busy || s.name === "New"} onClick={() => stUpdate(i, { enabled: !s.enabled })}
                    title={s.name === "New" ? "New status hamesha enabled rehta hai" : ""}
                    className={"text-xs rounded-md px-2 py-1 disabled:opacity-40 " + (s.enabled ? "text-amber-700 border border-amber-200 hover:bg-amber-50" : "text-emerald-700 border border-emerald-200 hover:bg-emerald-50")}>
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="font-semibold text-slate-700 mb-2">Add new Status</div>
            <div className="flex gap-2">
              <input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder="jaise Holding, Address Issue..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") stAdd(); }} />
              <button disabled={busy} onClick={stAdd} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Add</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Naya status upar list me jud jayega &mdash; niche Save dabane par hi lagu hoga.</p>
          </div>

          <div className="flex items-center gap-3">
            <button disabled={busy} onClick={saveStatuses} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Save Statuses</button>
            <button disabled={busy} onClick={loadStatuses} className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 text-sm font-medium disabled:opacity-50">Reset (reload)</button>
          </div>
          </>
          )}
        </div>
      )}

      {tab === "followup" && (
        <div className="space-y-4">
          {!fu ? <div className="text-sm text-slate-400">Load ho raha hai...</div> : (
          <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
            <div className="font-semibold text-slate-800">Follow-up Rules</div>
            <p className="text-xs text-slate-500">Har status: <b>Required</b> = follow-up date zaroori; <b>Unlimited</b> = aage koi bhi date; <b>Max din</b> = aaj + itne din tak (0 = koi limit nahi).</p>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                <div className="col-span-6">Status</div><div className="col-span-2 text-center">Required</div><div className="col-span-2 text-center">Unlimited</div><div className="col-span-2 text-center">Max din</div>
              </div>
              {statuses.map((s) => {
                const req = (fu.requiredStatuses || []).includes(s);
                const unl = (fu.unlimitedStatuses || []).includes(s);
                const md = fu.maxDaysByStatus?.[s] ?? 0;
                const tog = (list: string[], on: boolean) => on ? Array.from(new Set([...list, s])) : list.filter((x) => x !== s);
                return (
                  <div key={s} className="grid grid-cols-12 items-center px-3 py-1.5 border-t border-slate-100 text-sm">
                    <div className="col-span-6 text-slate-700">{s}</div>
                    <div className="col-span-2 text-center"><input type="checkbox" checked={req} onChange={(e) => setFu({ ...fu, requiredStatuses: tog(fu.requiredStatuses || [], e.target.checked) })} /></div>
                    <div className="col-span-2 text-center"><input type="checkbox" checked={unl} onChange={(e) => setFu({ ...fu, unlimitedStatuses: tog(fu.unlimitedStatuses || [], e.target.checked) })} /></div>
                    <div className="col-span-2 text-center"><input type="number" value={md} onChange={(e) => setFu({ ...fu, maxDaysByStatus: { ...(fu.maxDaysByStatus || {}), [s]: Number(e.target.value) } })} className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-center" /></div>
                  </div>
                );
              })}
            </div>
            <button disabled={busy} onClick={saveFu} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Save Follow-up Rules</button>
          </div>
          )}
        </div>
      )}

      {tab === "assignment" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white border border-slate-200 p-4 text-sm text-slate-700 space-y-2">
            <div className="font-semibold text-slate-800">Maujuda Assignment Authority</div>
            <div className="rounded-lg bg-slate-50 p-3">Abhi Assign / Reassign / Lead-Owner change = <b>SUPER_ADMIN + MANAGER</b> (Phase 1 me ship).</div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800">Naye doc anusaar ise <b>sirf SUPER_ADMIN</b> karna hai - aapki pushti par Assignment-phase me badlunga.</div>
          </div>
          <Locked phase="Phase 2B" points={["Kaun assign/reassign kar sake (configurable)", "Lead owner change authority", "Dealer assignment permission"]} />
        </div>
      )}

      {tab === "preferences" && (
        <div className="space-y-4">
          {!prefs ? <div className="text-sm text-slate-400">Load ho raha hai...</div> : (
          <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
            <div className="font-semibold text-slate-800">CRM Preferences</div>
            <p className="text-xs text-slate-500">Ye rules orders screen ke badges aur high-value highlight control karte hain. Khali/galat value par default lag jayega.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">High-value threshold (Rs)
                <input type="number" value={prefs.highValueThreshold} onChange={(e) => setPrefs({ ...prefs, highValueThreshold: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.highValueThreshold}</span>
              </label>
              <label className="text-sm text-slate-700">High-value quick presets (comma se)
                <input value={(prefs.highValuePresets || []).join(", ")} onChange={(e) => setPrefs({ ...prefs, highValuePresets: e.target.value.split(",").map((x: string) => Number(x.trim())).filter((x: number) => x > 0) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {(defs?.preferences?.highValuePresets || []).join(", ")}</span>
              </label>
              <label className="text-sm text-slate-700">VIP - minimum orders
                <input type="number" value={prefs.vipMinOrders} onChange={(e) => setPrefs({ ...prefs, vipMinOrders: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.vipMinOrders}</span>
              </label>
              <label className="text-sm text-slate-700">VIP - minimum spent (Rs)
                <input type="number" value={prefs.vipMinSpent} onChange={(e) => setPrefs({ ...prefs, vipMinSpent: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.vipMinSpent}</span>
              </label>
              <label className="text-sm text-slate-700">Repeat customer - minimum orders
                <input type="number" value={prefs.repeatMinOrders} onChange={(e) => setPrefs({ ...prefs, repeatMinOrders: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.repeatMinOrders}</span>
              </label>
              <label className="text-sm text-slate-700">Dashboard refresh (seconds)
                <input type="number" value={prefs.dashboardRefreshSec} onChange={(e) => setPrefs({ ...prefs, dashboardRefreshSec: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.dashboardRefreshSec}</span>
              </label>
              <label className="text-sm text-slate-700">Default landing queue
                <select value={prefs.defaultQueue} onChange={(e) => setPrefs({ ...prefs, defaultQueue: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="action">Action Required</option>
                  <option value="all">All Orders</option>
                </select>
                <span className="block text-[11px] text-slate-400">Default: {defs?.preferences?.defaultQueue}</span>
              </label>
            </div>
            <button disabled={busy} onClick={savePrefs} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Save Preferences</button>
          </div>
          )}
        </div>
      )}
      {tab === "dealers" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="font-semibold text-slate-700 mb-2">Add new Dealer</div>
            <div className="flex flex-wrap gap-2">
              <input value={newDealer} onChange={(e) => setNewDealer(e.target.value)} placeholder="Dealer ka naam..."
                className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") addDealer(); }} />
              <input value={newDealerCity} onChange={(e) => setNewDealerCity(e.target.value)} placeholder="City (optional)"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" onKeyDown={(e) => { if (e.key === "Enter") addDealer(); }} />
              <button disabled={busy} onClick={addDealer} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">Add</button>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 font-semibold text-slate-700 text-sm">Sabhi Dealers ({(dealers || []).length})</div>
            {!dealers ? <div className="p-4 text-sm text-slate-400">Load ho raha hai...</div> : (
              <div className="divide-y divide-slate-100">
                {dealers.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={"h-2 w-2 rounded-full shrink-0 " + (d.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                      <span className={"text-sm font-medium truncate " + (d.isActive ? "text-slate-800" : "text-slate-400 line-through")}>{d.name}</span>
                      {d.city && <span className="text-[11px] text-slate-400 shrink-0">({d.city})</span>}
                      {!d.isActive && <span className="text-[11px] text-slate-400 shrink-0">(disabled)</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button disabled={busy} onClick={() => renameDealer(d)} className="text-xs rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">Rename</button>
                      <button disabled={busy} onClick={() => cityDealer(d)} className="text-xs rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50">City</button>
                      <button disabled={busy} onClick={() => toggleDealer(d)} className={"text-xs rounded-md px-2 py-1 " + (d.isActive ? "text-amber-700 border border-amber-200 hover:bg-amber-50" : "text-emerald-700 border border-emerald-200 hover:bg-emerald-50")}>{d.isActive ? "Disable" : "Enable"}</button>
                    </div>
                  </div>
                ))}
                {dealers.length === 0 && <div className="p-4 text-sm text-slate-400">koi dealer nahi - upar se add karein</div>}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Dealer rename poori tarah safe hai (orders ID se jude hain). Disable karne par naye orders me nahi dikhega; purane orders aur reports surakshit.</p>
        </div>
      )}
      {tab === "trash" && <Locked phase="Phase 5" points={["Soft-deleted records restore", "Deleted by / date / reason", "Permanent delete (sirf SUPER_ADMIN)"]} />}

      <div className="mt-6 rounded-xl bg-white border border-slate-200 p-4">
        <div className="font-semibold text-slate-700 mb-2 text-sm">Maujuda pages (duplicate nahi - seedha link)</div>
        <div className="flex flex-wrap gap-2">
          <Link href="/users" className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">Users &amp; Access</Link>
          <Link href="/shiprocket" className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">Shiprocket</Link>
          <Link href="/audit" className="text-sm rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">Audit Logs</Link>
        </div>
      </div>
    </div>
  );
}
