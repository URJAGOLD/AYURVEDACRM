"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CourierSelectModal from "@/components/orders/CourierSelectModal";
import ShipmentModal from "@/components/orders/ShipmentModal";
import BookingResultModal from "@/components/orders/BookingResultModal";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/store/auth";
import type { Order } from "@/types";
import { SmartImport } from "@/components/orders/SmartImport";
import { BUCKET_MAP } from "@/lib/statuses";
import { DEFAULT_PREFERENCES } from "@/lib/crmDefaults";

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-700", Confirmed: "bg-emerald-100 text-emerald-700",
  "In Transit": "bg-indigo-100 text-indigo-700", Delivered: "bg-green-100 text-green-800",
  Callback: "bg-yellow-100 text-yellow-700", Pending: "bg-orange-100 text-orange-700",
  Cancelled: "bg-red-100 text-red-700", RTO: "bg-pink-100 text-pink-700",
};
const SHX:Record<string,string>={"New":"#3b82f6","Confirmed":"#22c55e","Packed":"#8b5cf6","In Transit":"#f97316","Dispatched":"#f97316","Delivered":"#15803d","GPO Delivered":"#15803d","Callback":"#eab308","Pending":"#f59e0b","Confirm Pending":"#f59e0b","Cancelled":"#ef4444","Confirm cancel":"#ef4444","Final cancel":"#ef4444","Dealer Cancel":"#ef4444","RTO":"#9f1239"};
const shx=(s:string)=>SHX[s]||"#94a3b8";
const SRC_CLR:Record<string,string>={"Meta":"#3b82f6","Instagram":"#ec4899","Facebook":"#1d4ed8","WhatsApp":"#22c55e","Google":"#f97316","YouTube":"#ef4444","Website":"#8b5cf6","Landing Page":"#8b5cf6","Calling":"#f59e0b","Direct":"#14b8a6","Manual":"#94a3b8","COD":"#22c55e"};
const srcBg=(s:string|null)=>SRC_CLR[s||""]||"#94a3b8";
// BUCKET_MAP imported from @/lib/statuses (shared with /api/orders/buckets + agent-stats).
const BUCKET_ORDER = ["New","Calling","Callback","Pending","Confirmed","Shipped","GPO Done","Delivered","Cancelled"];
const BUCKET_CLR: Record<string,string> = { New:"#3b82f6", Calling:"#0ea5e9", Callback:"#eab308", Pending:"#f59e0b", Confirmed:"#22c55e", Shipped:"#f97316", "GPO Done":"#8b5cf6", Delivered:"#15803d", Cancelled:"#ef4444" };

type Filters = {
  status:string; source:string; payment:string; phone:string; orderId:string; customer:string; city:string;
  pincode:string; product:string; stateId:string; districtId:string; leadOwner:string; zm:string;
  orderFrom:string; orderTo:string; followFrom:string; followTo:string; assignFrom:string; assignTo:string;
  statusFrom:string; statusTo:string; statusChange:string;
  cod:string; onlinePaidOnly:string; highValue:string; shipStatus:string; statusIn:string; minValue:string; followDue:string; queue:string;
};
const EMPTY: Filters = { status:"", source:"", payment:"", phone:"", orderId:"", customer:"", city:"", pincode:"", product:"", stateId:"", districtId:"", leadOwner:"", zm:"", orderFrom:"", orderTo:"", followFrom:"", followTo:"", assignFrom:"", assignTo:"", statusFrom:"", statusTo:"", statusChange:"", cod:"", onlinePaidOnly:"", highValue:"", shipStatus:"", statusIn:"", minValue:"", followDue:"", queue:"" };

const COLS = ["Order ID","Date","Customer","Phone","Product","Qty","Amount","Total","Online","Balance","Status","Payment","Source","City","State","District","Pincode","Address","Follow-up","Lead Owner","Agent Assign","Dealer","Dealer Assign","ZM","AWB","Shipping","Remark","Actions"];
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN") : "-");
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "-");

export default function OrdersPage() {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("20");
  const [showFilters, setShowFilters] = useState(true);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [shipStatusList, setShipStatusList] = useState<string[]>([]);
  const [shipOpen, setShipOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [trackingIds, setTrackingIds] = useState<number[]>([]);
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [dispatchMsg, setDispatchMsg] = useState("");
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [jumpPage, setJumpPage] = useState("");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const [states, setStates] = useState<{ id: number; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [sel, setSel] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bStatus, setBStatus] = useState("");
  const [bAgent, setBAgent] = useState("");
  const [bookOrder, setBookOrder] = useState<Order | null>(null);
  const [shipOrder, setShipOrder] = useState<Order | null>(null);
  const [bookResult, setBookResult] = useState<any>(null);
  const [assignPreview, setAssignPreview] = useState<any>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const viewAll = can("orders.viewAll");
  const canBulkStatus = can("orders.changeStatus");
  const canBulkAssign = can("orders.assignAgent");
  const canDelete = can("orders.delete");
  const canBulk = canBulkStatus || canBulkAssign || canDelete;

  useEffect(() => {
    api.get("/api/masters/statuses").then((r) => setStatuses(r.statuses)).catch(() => {});
    api.get("/api/masters/states").then((r) => setStates(r.states)).catch(() => {});
    api.get("/api/orders/sources").then((r) => setSourceNames(r.sources || [])).catch(() => {});
    api.get("/api/orders/ship-statuses").then((r) => setShipStatusList(r.statuses || [])).catch(() => {});
    if (viewAll || canBulkAssign) api.get("/api/users").then((r) => setUsers(r.users || [])).catch(() => {});
  }, [viewAll, canBulkAssign]);

  useEffect(() => {
    if (form.stateId) api.get("/api/masters/states/" + form.stateId + "/districts").then((r) => setDistricts(r.districts || [])).catch(() => setDistricts([]));
    else setDistricts([]);
  }, [form.stateId]);

  const { data: crmData, isFetched: crmFetched } = useQuery({ queryKey: ["crm-settings"], queryFn: () => api.get("/api/settings/crm"), staleTime: 300000, refetchOnWindowFocus: false });
  const prefs = crmData?.preferences || DEFAULT_PREFERENCES;
  const didLand = useRef(false);
  // Persist filters across navigation: Back from an order keeps the filtered list.
  useEffect(() => {
    if (didLand.current) return;
    try {
      const urlQ = new URLSearchParams(window.location.search).get("queue");
      const s = JSON.parse(sessionStorage.getItem("ph_orders_state") || "null");
      if (urlQ) { const dq: Filters = { ...EMPTY, queue: urlQ }; setForm(dq); setApplied(dq); didLand.current = true; }
      else if (s) { setForm(s.applied || EMPTY); setApplied(s.applied || EMPTY); setPage(s.page || 1); setLimit(s.limit || "20"); didLand.current = true; }
      else { const q = !crmFetched ? "action" : (prefs.defaultQueue === "all" ? "" : prefs.defaultQueue); const dq: Filters = { ...EMPTY, queue: q }; setForm(dq); setApplied(dq); if (crmFetched) didLand.current = true; }
    } catch {}
    setHydrated(true);
  }, [crmFetched]);
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem("ph_orders_state", JSON.stringify({ applied, page, limit })); } catch {}
  }, [applied, page, limit, hydrated]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit });
    Object.entries(applied).forEach(([k, v]) => { if (!v) return; if (k === "phone") { const d = String(v).replace(/\D/g, ""); if (d) p.set(k, d); return; } p.set(k, v); });
    return p.toString();
  }, [applied, page, limit]);

  const qsAll = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(applied).forEach(([k, v]) => { if (!v) return; if (k === "phone") { const d = String(v).replace(/\D/g, ""); if (d) p.set(k, d); return; } p.set(k, v); });
    return p.toString();
  }, [applied]);

  const { data, isLoading, refetch } = useQuery({ queryKey: ["orders", qs], queryFn: () => api.get("/api/orders?" + qs), placeholderData: (prev: any) => prev });
  const orders: Order[] = data?.orders ?? [];
  const { data: bucketData, refetch: refetchBuckets } = useQuery({ queryKey: ["order-buckets", qsAll], queryFn: () => api.get("/api/orders/buckets" + (qsAll ? "?" + qsAll : "")), refetchInterval: 30000, placeholderData: (p: any) => p });
  const applyBucket = (b: string) => { const want = BUCKET_MAP[b].join(","); setForm((f) => ({ ...f, status: "", queue: "", statusIn: f.statusIn === want ? "" : want })); };
  const bucketActive = (b: string) => form.statusIn === BUCKET_MAP[b].join(",");
  const setQueue = (q: string) => setForm((f) => ({ ...f, status: "", statusIn: "", queue: f.queue === q ? "" : q }));

  const allOnPage = orders.map((o) => o.id);
  const allSelected = orders.length > 0 && allOnPage.every((id) => sel.includes(id));
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSel((s) => (allSelected ? s.filter((id) => !allOnPage.includes(id)) : Array.from(new Set([...s, ...allOnPage]))));
  const clearSel = () => setSel([]);
  const [selAllLoading, setSelAllLoading] = useState(false);
  async function selectAllMatching() {
    setSelAllLoading(true);
    try { const r = await api.get("/api/orders/ids" + (qsAll ? "?" + qsAll : "")); setSel(r.ids || []); }
    catch (e: any) { setMsg("Select all: " + e.message); }
    finally { setSelAllLoading(false); }
  }

  const sf = (k: keyof Filters, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const apply = () => { setApplied(form); setPage(1); };
  const clear = () => { setForm(EMPTY); setApplied(EMPTY); setDistricts([]); setPage(1); try { sessionStorage.removeItem("ph_orders_state"); } catch {} };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") apply(); };
  // Live filtering: debounce form -> applied (Apply button removed). Preserve restored page on first sync after hydration.
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      setApplied(form);
      if (firstSyncRef.current) firstSyncRef.current = false;
      else setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [form, hydrated]);

  async function quickStatus(o: Order, status: string) { await api.put("/api/orders/" + o.id, { orderStatus: status }); refetch(); refetchBuckets(); }
  async function bulkStatus() {
    if (!bStatus || sel.length === 0) return;
    setMsg("Updating status of " + sel.length + " orders...");
    try { const r = await api.post("/api/orders/bulk-status", { ids: sel, status: bStatus }); setMsg("Status updated for " + r.updated + " orders"); clearSel(); setBStatus(""); refetch(); refetchBuckets(); }
    catch (e: any) { setMsg("Bulk status: " + e.message); }
  }
  async function openAssignFlow() {
    if (sel.length === 0) return;
    setAssignBusy(true); setMsg("");
    try { const p = await api.post("/api/orders/assign-preview", { ids: sel }); setAssignPreview(p); }
    catch (e: any) { setMsg("Assign check: " + e.message); }
    finally { setAssignBusy(false); }
  }
  async function confirmAssign() {
    setAssignPreview(null);
    setMsg("Assigning " + sel.length + " orders...");
    try { const r = await api.post("/api/orders/bulk-assign", { ids: sel, agentId: bAgent || null }); setMsg("Assigned " + r.updated + " orders" + (bAgent ? "" : " (unassigned)")); clearSel(); setBAgent(""); refetch(); refetchBuckets(); }
    catch (e: any) { setMsg("Bulk assign: " + e.message); }
  }
  async function bulkDelete() {
    if (sel.length === 0) return;
    if (!window.confirm("Delete " + sel.length + " selected orders? They will be removed from the list.")) return;
    setMsg("Deleting " + sel.length + " orders...");
    try { const r = await api.post("/api/orders/bulk-delete", { ids: sel }); setMsg("Deleted " + r.deleted + " orders"); clearSel(); refetch(); }
    catch (e: any) { setMsg("Bulk delete: " + e.message); }
  }
  async function delOne(o: Order) {
    if (!window.confirm("Delete order " + o.orderCode + "?")) return;
    try { await api.del("/api/orders/" + o.id); setMsg("Deleted " + o.orderCode); refetch(); }
    catch (e: any) { setMsg("Delete: " + e.message); }
  }
  async function book(o: Order, courierId?: number) {
    setMsg("");
    try { const r = await api.post("/api/shiprocket/book", { orderId: o.id, courierId }); setBookOrder(null); setBookResult({ ok: true, awb: r.awb, courier: r.courier, shipmentId: r.shipmentId, warning: r.warning, orderId: o.id, order: o }); qc.invalidateQueries({ queryKey: ["orders"] }); }
    catch (e: any) { setBookOrder(null); setBookResult({ ok: false, errorMsg: e.message, orderId: o.id, order: o }); }
  }
  async function trackOne(o: Order) {
    if (!o.awbCode) return;
    setTrackingIds((ids) => [...ids, o.id]);
    try { await api.get("/api/shiprocket/track?orderId=" + o.id); qc.invalidateQueries({ queryKey: ["orders"] }); setMsg("Tracked: " + o.orderCode); }
    catch (e: any) { setMsg("Track failed: " + e.message); }
    finally { setTrackingIds((ids) => ids.filter((x) => x !== o.id)); }
  }
  async function labelOne(o: Order) {
    if (!o.shipmentId) return;
    setLabelIds((ids) => [...ids, o.id]);
    try { const r = await api.post("/api/shiprocket/label", { orderId: o.id }); if (r.labelUrl) { window.open(r.labelUrl, "_blank"); qc.invalidateQueries({ queryKey: ["orders"] }); setMsg("Label ready: " + o.orderCode); } else { setMsg("No label URL for " + o.orderCode); } }
    catch (e: any) { setMsg("Label failed: " + e.message); }
    finally { setLabelIds((ids) => ids.filter((x) => x !== o.id)); }
  }
  async function bulkDispatch(action: "book" | "label" | "pickup") {
    if (sel.length === 0) return;
    const label = action === "book" ? "Book Auto" : action === "label" ? "Get Labels" : "Request Pickup";
    if (!window.confirm(label + " for " + sel.length + " selected order(s)?")) return;
    setDispatchBusy(true); setDispatchMsg("");
    try {
      const r = await api.post("/api/shiprocket/bulk-dispatch", { action, orderIds: sel });
      qc.invalidateQueries({ queryKey: ["orders"] });
      const lines = r.results.map((x: any) => x.orderCode + ": " + (x.ok ? "✓ " + x.msg : "✗ " + x.msg)).join("\n");
      setDispatchMsg(label + " - " + r.success + "/" + r.total + " OK\n" + lines);
    } catch (e: any) { setDispatchMsg(label + " failed: " + e.message); }
    finally { setDispatchBusy(false); }
  }

  // Phase B: compact filter dropdowns - Date (single) / Quick Filters (multi) / Shipment (multi, dynamic)
  const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const _today = new Date();
  const _ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const _todayStr = ymd(_today);
  const dateOptions: { key: string; label: string; from: string; to: string }[] = [
    { key: "all", label: "All Time", from: "", to: "" },
    { key: "today", label: "Today", from: _todayStr, to: _todayStr },
    { key: "yest", label: "Yesterday", from: _ago(1), to: _ago(1) },
    { key: "7d", label: "Last 7 Days", from: _ago(6), to: _todayStr },
    { key: "15d", label: "Last 15 Days", from: _ago(14), to: _todayStr },
    { key: "30d", label: "Last 30 Days", from: _ago(29), to: _todayStr },
    { key: "tm", label: "This Month", from: ymd(new Date(_today.getFullYear(), _today.getMonth(), 1)), to: _todayStr },
    { key: "lm", label: "Last Month", from: ymd(new Date(_today.getFullYear(), _today.getMonth() - 1, 1)), to: ymd(new Date(_today.getFullYear(), _today.getMonth(), 0)) },
  ];
  const _md = dateOptions.find((o) => o.from === form.orderFrom && o.to === form.orderTo);
  const dateKey = _md ? _md.key : ((form.orderFrom || form.orderTo) ? "custom" : "all");
  const applyDateKey = (k: string) => { const o = dateOptions.find((x) => x.key === k); if (o) setForm((f) => ({ ...f, orderFrom: o.from, orderTo: o.to })); };
  const STATUS_QUICK: Record<string, string[]> = { "Confirmed": ["Confirmed"], "GPO Done": ["GPO Done"], "Delivered": ["Delivered", "GPO Delivered"] };
  const _statusInArr = form.statusIn ? form.statusIn.split(",").filter(Boolean) : [];
  const statusQuickOn = (k: string) => STATUS_QUICK[k].every((v) => _statusInArr.includes(v));
  const toggleStatusQuick = (k: string) => setForm((f) => { const cur = f.statusIn ? f.statusIn.split(",").filter(Boolean) : []; const vals = STATUS_QUICK[k]; const on = vals.every((v) => cur.includes(v)); const next = on ? cur.filter((v) => !vals.includes(v)) : Array.from(new Set([...cur, ...vals])); return { ...f, statusIn: next.join(",") }; });
  const quickActiveCount = (statusQuickOn("Confirmed") ? 1 : 0) + (statusQuickOn("GPO Done") ? 1 : 0) + (statusQuickOn("Delivered") ? 1 : 0) + (form.leadOwner === "0" ? 1 : 0) + (form.followDue ? 1 : 0) + (form.onlinePaidOnly ? 1 : 0) + (form.minValue ? 1 : 0);
  const shipSelected = form.shipStatus ? form.shipStatus.split(",").filter(Boolean) : [];
  const toggleShip = (s: string) => setForm((f) => { const cur = f.shipStatus ? f.shipStatus.split(",").filter(Boolean) : []; const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]; return { ...f, shipStatus: next.join(",") }; });
  // R2b: active filter badges (read from applied = what is actually filtering)
  const stName = (id: string) => states.find((s) => String(s.id) === id)?.name || id;
  const dtName = (id: string) => districts.find((s) => String(s.id) === id)?.name || id;
  const ownerName = (id: string) => (id === "0" ? "Unassigned" : users.find((u) => String(u.id) === id)?.name || ("#" + id));
  const clr = (...keys: (keyof Filters)[]) => setForm((f) => { const nf: any = { ...f }; keys.forEach((k) => (nf[k] = "")); return nf; });
  const A = applied;
  const badges: { label: string; onX: () => void }[] = [];
  if (A.status) badges.push({ label: "Status: " + A.status, onX: () => clr("status") });
  if (A.source) badges.push({ label: "Source: " + A.source, onX: () => clr("source") });
  if (A.payment) badges.push({ label: "Payment: " + A.payment, onX: () => clr("payment") });
  if (A.phone) badges.push({ label: "Phone: " + A.phone, onX: () => clr("phone") });
  if (A.orderId) badges.push({ label: "Order: " + A.orderId, onX: () => clr("orderId") });
  if (A.customer) badges.push({ label: "Customer: " + A.customer, onX: () => clr("customer") });
  if (A.city) badges.push({ label: "City: " + A.city, onX: () => clr("city") });
  if (A.pincode) badges.push({ label: "Pincode: " + A.pincode, onX: () => clr("pincode") });
  if (A.product) badges.push({ label: "Product: " + A.product, onX: () => clr("product") });
  if (A.stateId) badges.push({ label: "State: " + stName(A.stateId), onX: () => clr("stateId", "districtId") });
  if (A.districtId) badges.push({ label: "District: " + dtName(A.districtId), onX: () => clr("districtId") });
  if (A.leadOwner) badges.push({ label: "Owner: " + ownerName(A.leadOwner), onX: () => clr("leadOwner") });
  if (A.zm) badges.push({ label: "ZM: " + A.zm, onX: () => clr("zm") });
  if (A.orderFrom || A.orderTo) badges.push({ label: "Date: " + (A.orderFrom || "..") + " -> " + (A.orderTo || ".."), onX: () => clr("orderFrom", "orderTo") });
  if (A.followFrom || A.followTo) badges.push({ label: "Follow-up: " + (A.followFrom || "..") + " -> " + (A.followTo || ".."), onX: () => clr("followFrom", "followTo") });
  if (A.assignFrom || A.assignTo) badges.push({ label: "Assigned: " + (A.assignFrom || "..") + " -> " + (A.assignTo || ".."), onX: () => clr("assignFrom", "assignTo") });
  if (A.statusFrom || A.statusTo || A.statusChange) badges.push({ label: "Status-change: " + (A.statusChange ? A.statusChange + " " : "") + (A.statusFrom || "..") + " -> " + (A.statusTo || ".."), onX: () => clr("statusFrom", "statusTo", "statusChange") });
  if (A.onlinePaidOnly) badges.push({ label: "Online Paid", onX: () => clr("onlinePaidOnly") });
  if (A.minValue) badges.push({ label: "High Value: Rs " + A.minValue + "+", onX: () => clr("minValue") });
  if (A.statusIn) badges.push({ label: "Status: " + A.statusIn.split(",").join(", "), onX: () => clr("statusIn") });
  if (A.followDue) badges.push({ label: "Pending Followups", onX: () => clr("followDue") });
  if (A.shipStatus) badges.push({ label: "Shipment: " + A.shipStatus.split(",").join(", "), onX: () => clr("shipStatus") });

  // Synced top+bottom scrollbars & Shift+Wheel horizontal scroll
  useEffect(() => {
    const top = topScrollRef.current; const wrap = tableWrapRef.current;
    if (!top || !wrap) return;
    // set top scrollbar width to match inner table width
    const updateWidth = () => {
      const inner = wrap.querySelector("table");
      if (inner) { (top.firstElementChild as HTMLElement | null) && ((top.firstElementChild as HTMLElement).style.width = inner.scrollWidth + "px"); }
    };
    updateWidth();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateWidth) : null;
    if (ro) ro.observe(wrap);
    const syncFromTop = () => { if (isSyncingScroll.current) return; isSyncingScroll.current = true; wrap.scrollLeft = top.scrollLeft; requestAnimationFrame(() => { isSyncingScroll.current = false; }); };
    const syncFromBot = () => { if (isSyncingScroll.current) return; isSyncingScroll.current = true; top.scrollLeft = wrap.scrollLeft; requestAnimationFrame(() => { isSyncingScroll.current = false; }); };
    top.addEventListener("scroll", syncFromTop); wrap.addEventListener("scroll", syncFromBot);
    // Shift + Mouse Wheel = horizontal scroll on the table
    const onWheel = (e: WheelEvent) => { if (e.shiftKey) { e.preventDefault(); wrap.scrollLeft += e.deltaY; top.scrollLeft += e.deltaY; } };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => { top.removeEventListener("scroll", syncFromTop); wrap.removeEventListener("scroll", syncFromBot); wrap.removeEventListener("wheel", onWheel); if (ro) ro.disconnect(); };
  }, []);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-gray-900">Manage Orders</h1><p className="text-sm text-gray-500">{data?.total ?? 0} orders</p></div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-ghost" onClick={() => setShowFilters((s) => !s)}>{showFilters ? "Hide Filters" : "Filters"}</button>
          {can("orders.export") && <button className="btn btn-ghost" onClick={() => api.download("/api/orders/export?" + qs, "orders.xlsx")}>Export</button>}
          {can("orders.import") && <button className="btn btn-ghost" onClick={() => setImporting(true)}>Bulk Upload</button>}
          {can("orders.create") && <button className="btn btn-primary" onClick={() => router.push("/orders/new")}>+ New Order</button>}
        </div>
      </div>
      {msg && <div className="mb-3 text-sm rounded-lg bg-brand-light text-brand-dark px-3 py-2">{msg}</div>}

      {bucketData && (
        <div className="mb-3 space-y-2">
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex items-center gap-2 px-1 min-w-max">
              <button onClick={() => setQueue("action")} className={"px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition " + (form.queue === "action" ? "bg-teal-600 text-white border-teal-600" : "bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100")}>{"\uD83D\uDD25"} Action Required <span className="ml-1 font-extrabold">{bucketData.actionRequired ?? 0}</span></button>
              
              <button onClick={() => setQueue("tomorrow")} className={"px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition " + (form.queue === "tomorrow" ? "bg-violet-600 text-white border-violet-600" : "bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100")}>{"\uD83D\uDCC5"} Tomorrow <span className="ml-1 font-extrabold">{bucketData.tomorrow ?? 0}</span></button>
              <span className="mx-1 h-5 w-px bg-gray-300" />
              <button onClick={() => setForm((f) => ({ ...f, status: "", statusIn: "", queue: "" }))} className={"px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap " + (!form.statusIn && !form.queue ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>All <span className="ml-1 font-extrabold">{bucketData.total}</span></button>
              {BUCKET_ORDER.map((b) => { const c = bucketData.buckets?.[b] ?? 0; const on = bucketActive(b); return (
                <button key={b} onClick={() => applyBucket(b)} className={"px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition " + (on ? "text-white" : "bg-white hover:bg-gray-50")} style={on ? { background: BUCKET_CLR[b], borderColor: BUCKET_CLR[b] } : { borderColor: BUCKET_CLR[b] + "55", color: BUCKET_CLR[b] }}>{b} <span className="ml-1 font-extrabold">{c}</span></button>
              ); })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">Assigned <b className="text-slate-900">{bucketData.assigned}</b></span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">Worked <b>{bucketData.worked}</b></span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">Untouched (New) <b>{bucketData.untouched}</b></span>
            {bucketData.overdue > 0 && <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1 font-semibold text-red-700">Overdue Followups <b>{bucketData.overdue}</b></span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="label">Date</label>
          <select className="input w-44" value={dateKey} onChange={(e) => applyDateKey(e.target.value)}>
            {dateKey === "custom" && <option value="custom">Custom (set below)</option>}
            {dateOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="relative">
          <label className="label">Quick Filters</label>
          <button type="button" onClick={() => setQuickOpen((s) => !s)} className="input w-44 flex items-center justify-between text-left">
            <span className={quickActiveCount ? "text-gray-900" : "text-gray-400"}>{quickActiveCount ? quickActiveCount + " selected" : "None"}</span>
            <span className="text-gray-400">&#9662;</span>
          </button>
          {quickOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setQuickOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                {viewAll && <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={form.leadOwner === "0"} onChange={() => setForm((f) => ({ ...f, leadOwner: f.leadOwner === "0" ? "" : "0" }))} /><span>Unassigned</span></label>}
                <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={!!form.followDue} onChange={() => setForm((f) => ({ ...f, followDue: f.followDue ? "" : "1" }))} /><span>Pending Followups</span></label>
                <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={!!form.onlinePaidOnly} onChange={() => setForm((f) => ({ ...f, onlinePaidOnly: f.onlinePaidOnly ? "" : "1" }))} /><span>Online Paid</span></label>
                <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={statusQuickOn("Confirmed")} onChange={() => toggleStatusQuick("Confirmed")} /><span>Confirmed</span></label>
                <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={statusQuickOn("GPO Done")} onChange={() => toggleStatusQuick("GPO Done")} /><span>GPO Done (Booked)</span></label>
                <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={statusQuickOn("Delivered")} onChange={() => toggleStatusQuick("Delivered")} /><span>Delivered</span></label>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <label className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer"><input type="checkbox" checked={!!form.minValue} onChange={(e) => setForm((f) => ({ ...f, minValue: e.target.checked ? (f.minValue || String(prefs.highValueThreshold)) : "" }))} /><span>High Value</span></label>
                  {!!form.minValue && (
                    <div className="flex gap-1 px-1 pb-1">
                      {(prefs.highValuePresets || []).map((n: number) => String(n)).map((v) => <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, minValue: v }))} className={"text-xs px-2 py-0.5 rounded border " + (form.minValue === v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200")}>Rs {v}+</button>)}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setQuickOpen(false)} className="mt-1 w-full text-xs font-semibold text-white bg-emerald-600 rounded-lg py-1">Done</button>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <label className="label">Shipment</label>
          <button type="button" onClick={() => setShipOpen((s) => !s)} className="input w-44 flex items-center justify-between text-left">
            <span className={shipSelected.length ? "text-gray-900" : "text-gray-400"}>{shipSelected.length ? shipSelected.length + " selected" : "All"}</span>
            <span className="text-gray-400">&#9662;</span>
          </button>
          {shipOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShipOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-60 max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500">Shipment status</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, shipStatus: "" }))} className="text-xs text-rose-600 hover:underline">Clear</button>
                </div>
                {shipStatusList.length === 0 && <div className="text-xs text-gray-400 px-1 py-2">No statuses yet</div>}
                {shipStatusList.map((s) => (
                  <label key={s} className="flex items-center gap-2 px-1 py-1 text-sm rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={shipSelected.includes(s)} onChange={() => toggleShip(s)} className="rounded" />
                    <span>{s}</span>
                  </label>
                ))}
                <button type="button" onClick={() => setShipOpen(false)} className="mt-1 w-full text-xs font-semibold text-white bg-emerald-600 rounded-lg py-1">Done</button>
              </div>
            </>
          )}
        </div>
      </div>


      {badges.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-gray-400 mr-1">Active</span>
          {badges.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
              {b.label}
              <button type="button" onClick={b.onX} className="text-gray-400 hover:text-rose-600 font-bold leading-none">&times;</button>
            </span>
          ))}
          <button type="button" onClick={clear} className="text-xs text-rose-600 hover:underline ml-1 font-semibold">Clear all</button>
        </div>
      )}

      {showFilters && (
        <div className="card p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => sf("status", e.target.value)}>
                <option value="">All</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="label">Source</label>
              <select className="input" value={form.source} onChange={(e) => sf("source", e.target.value)}>
                <option value="">All</option>{sourceNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="label">Payment</label>
              <select className="input" value={form.payment} onChange={(e) => sf("payment", e.target.value)}>
                <option value="">All</option><option value="Pending">Pending</option><option value="Completed">Completed</option>
              </select></div>
            <div><label className="label">State</label>
              <select className="input" value={form.stateId} onChange={(e) => { sf("stateId", e.target.value); sf("districtId", ""); }}>
                <option value="">All</option>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className="label">District</label>
              <select className="input" value={form.districtId} onChange={(e) => sf("districtId", e.target.value)} disabled={!form.stateId}>
                <option value="">All</option>{districts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className="label">Pincode</label><input className="input" value={form.pincode} onChange={(e) => sf("pincode", e.target.value)} onKeyDown={onKey} /></div>

            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => sf("phone", e.target.value)} onKeyDown={onKey} /></div>
            <div><label className="label">Order ID</label><input className="input" value={form.orderId} onChange={(e) => sf("orderId", e.target.value)} onKeyDown={onKey} placeholder="PHCRM..." /></div>
            <div><label className="label">Customer</label><input className="input" value={form.customer} onChange={(e) => sf("customer", e.target.value)} onKeyDown={onKey} /></div>
            <div><label className="label">City</label><input className="input" value={form.city} onChange={(e) => sf("city", e.target.value)} onKeyDown={onKey} /></div>
            <div><label className="label">Product</label><input className="input" value={form.product} onChange={(e) => sf("product", e.target.value)} onKeyDown={onKey} /></div>
            {viewAll && (<div><label className="label">Lead Owner</label>
              <select className="input" value={form.leadOwner} onChange={(e) => sf("leadOwner", e.target.value)}>
                <option value="">All</option><option value="0">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>)}
            {viewAll && users.length > 0 && (<div><label className="label">ZM</label>
              <select className="input" value={form.zm} onChange={(e) => sf("zm", e.target.value)}>
                <option value="">All</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>)}

            <div><label className="label">Order date from</label><input type="date" className="input" value={form.orderFrom} onChange={(e) => sf("orderFrom", e.target.value)} /></div>
            <div><label className="label">Order date to</label><input type="date" className="input" value={form.orderTo} onChange={(e) => sf("orderTo", e.target.value)} /></div>
            <div><label className="label">Follow-up from</label><input type="date" className="input" value={form.followFrom} onChange={(e) => sf("followFrom", e.target.value)} /></div>
            <div><label className="label">Follow-up to</label><input type="date" className="input" value={form.followTo} onChange={(e) => sf("followTo", e.target.value)} /></div>
            <div><label className="label">Agent assign from</label><input type="date" className="input" value={form.assignFrom} onChange={(e) => sf("assignFrom", e.target.value)} /></div>
            <div><label className="label">Agent assign to</label><input type="date" className="input" value={form.assignTo} onChange={(e) => sf("assignTo", e.target.value)} /></div>
            <div><label className="label" style={{color:"#0ea5e9"}}>Status changed from</label><input type="date" className="input" value={form.statusFrom} onChange={(e) => sf("statusFrom", e.target.value)} /></div>
            <div><label className="label" style={{color:"#0ea5e9"}}>Status changed to</label><input type="date" className="input" value={form.statusTo} onChange={(e) => sf("statusTo", e.target.value)} /></div>
            <div><label className="label" style={{color:"#0ea5e9"}}>Status changed = (kaun-sa)</label><select className="input" value={form.statusChange} onChange={(e) => sf("statusChange", e.target.value)}><option value="">Any status</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-medium text-emerald-600">Filters apply live</span>
            <button className="btn btn-ghost" style={{color:"#0369a1"}} onClick={() => setForm((f) => ({ ...f, statusFrom: _todayStr, statusTo: _todayStr }))}>Aaj jin par kaam hua</button>
            <button className="btn btn-ghost" onClick={clear}>Clear</button>
            <span className="text-sm font-semibold text-brand-dark">{(data?.total ?? 0)} results</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="label mb-0">Rows</span>
              <select className="input w-24" value={limit} onChange={(e) => { setLimit(e.target.value); setPage(1); }}>
                <option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="100000">All</option>
              </select>
            </div>
          </div>
          {data?.statusActivitySummary && data.statusActivitySummary.length > 0 && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2">
              <div className="text-[11px] font-semibold text-sky-700 mb-1">Status-change activity (is window me) — total {data.statusActivitySummary.reduce((s: number, x: any) => s + x.count, 0)} changes:</div>
              <div className="flex flex-wrap gap-1.5">
                {data.statusActivitySummary.map((x: any) => (
                  <span key={x.status} className="inline-flex items-center gap-1 rounded-full bg-white border border-sky-200 px-2 py-0.5 text-[11px]">
                    <span className="font-medium text-gray-700">{x.status}</span>
                    <span className="font-bold text-sky-700">{x.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {canBulk && sel.length > 0 && (
        <div className="card p-3 mb-3 flex items-center gap-3 flex-wrap bg-brand-light border-brand">
          <span className="text-sm font-semibold text-brand-dark">{sel.length} selected</span>
          {allSelected && (data?.total ?? 0) > sel.length && (
            <button className="text-sm text-brand-dark underline" disabled={selAllLoading} onClick={selectAllMatching}>
              {selAllLoading ? "Selecting..." : ("Select all " + (data?.total ?? 0) + " matching")}
            </button>
          )}
          {(data?.total ?? 0) > 0 && sel.length === (data?.total ?? 0) && (
            <span className="text-xs text-brand-dark font-medium">All {data?.total} selected</span>
          )}
          {canBulkStatus && (
            <div className="flex items-center gap-2">
              <select className="input w-44" value={bStatus} onChange={(e) => setBStatus(e.target.value)}>
                <option value="">Set status...</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!bStatus} onClick={bulkStatus}>Apply status</button>
            </div>
          )}
          {canBulkAssign && users.length > 0 && (
            <div className="flex items-center gap-2">
              <select className="input w-44" value={bAgent} onChange={(e) => setBAgent(e.target.value)}>
                <option value="">Change Lead Owner...</option><option value="0">Unassign</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!bAgent || assignBusy} onClick={openAssignFlow}>{assignBusy ? "Checking..." : "Set Lead Owner"}</button>
            </div>
          )}
          {can("shiprocket.book") && <>
            <button className="btn btn-primary px-2 py-1 text-xs" disabled={dispatchBusy} onClick={() => bulkDispatch("book")}>&#128230; Book Auto</button>
            <button className="btn btn-ghost px-2 py-1 text-xs" disabled={dispatchBusy} onClick={() => bulkDispatch("label")}>&#127991; Get Labels</button>
            <button className="btn btn-ghost px-2 py-1 text-xs" disabled={dispatchBusy} onClick={() => bulkDispatch("pickup")}>&#128652; Request Pickup</button>
          </>}
          {canDelete && <button className="btn btn-danger" onClick={bulkDelete}>Delete selected</button>}
          <button className="btn btn-ghost ml-auto" onClick={clearSel}>Clear selection</button>
        </div>
      )}
      {dispatchMsg && (
        <div className="mb-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-800 whitespace-pre-wrap flex items-start justify-between gap-2">
          <span>{dispatchMsg}</span>
          <button type="button" className="text-gray-400 hover:text-gray-700 shrink-0" onClick={() => setDispatchMsg("")}>&#10005;</button>
        </div>
      )}

      {/* Top synced scrollbar */}
      <div ref={topScrollRef} className="overflow-x-auto mb-0 scrollbar-thin" style={{height:"12px",overflowY:"hidden"}}>
        <div style={{height:"1px"}} />
      </div>
      <div ref={tableWrapRef} className="card overflow-x-auto">
        <table className="text-sm min-w-[2400px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              {canBulk && <th className="px-3 py-2 sticky left-0 z-10 bg-gray-50"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>}
              <th className={"px-3 py-2 whitespace-nowrap sticky z-10 bg-gray-50 " + (canBulk ? "left-8" : "left-0")}>Order ID</th>
              <th className={"px-3 py-2 whitespace-nowrap sticky z-10 bg-gray-50 " + (canBulk ? "left-[7rem]" : "left-[5.5rem]")}>Customer</th>
              <th className={"px-3 py-2 whitespace-nowrap sticky z-10 bg-gray-50 " + (canBulk ? "left-[17rem]" : "left-[15.5rem]")}>Phone</th>
              <th className={"px-3 py-2 whitespace-nowrap sticky z-10 bg-gray-50 " + (canBulk ? "left-[24rem]" : "left-[22.5rem]")}>Status</th>
              {COLS.filter((c) => !["Order ID","Customer","Phone","Status"].includes(c)).map((c) => <th key={c} className="px-3 py-2 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={COLS.length + (canBulk ? 1 : 0)} className="px-3 py-8 text-center text-gray-400">Loading...</td></tr>}
            {!isLoading && orders.length === 0 && <tr><td colSpan={COLS.length + (canBulk ? 1 : 0)} className="px-3 py-8 text-center text-gray-400">No orders</td></tr>}
            {orders.map((o, rowIdx) => {
              const total = (o.totalAmount != null && o.totalAmount !== "") ? Number(o.totalAmount) : Number(o.price) * (Number(o.quantity) || 1);
              const online = Number(o.onlinePaid) || 0;
              const bal = +(total - online).toFixed(2);
              return (
              <tr key={o.id} className={"border-t border-gray-100 whitespace-nowrap hover:bg-blue-50 " + (sel.includes(o.id)?"bg-brand-light/40":(rowIdx%2===1?" bg-slate-50":""))} style={{borderLeft:"3px solid "+shx(o.orderStatus)}}>
                {canBulk && <td className={"px-3 py-2 sticky left-0 z-[5] " + (sel.includes(o.id) ? "bg-brand-light/40" : (rowIdx%2===1 ? "bg-slate-50" : "bg-white"))}><input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} aria-label={"Select " + o.orderCode} /></td>}
                <td className={"px-3 py-2 font-medium sticky z-[5] " + (canBulk ? "left-8" : "left-0") + " " + (sel.includes(o.id) ? "bg-brand-light/40" : (rowIdx%2===1 ? "bg-slate-50" : "bg-white"))}>{can("orders.edit") ? <button className="text-blue-700 font-bold hover:text-blue-900" onClick={() => router.push("/orders/" + o.id)}>{o.orderCode}</button> : <span className="text-gray-900">{o.orderCode}</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{dt(o.dateTime)}</td>
                <td className={"px-3 py-2 sticky z-[5] " + (canBulk ? "left-[7rem]" : "left-[5.5rem]") + " " + (sel.includes(o.id) ? "bg-brand-light/40" : (rowIdx%2===1 ? "bg-slate-50" : "bg-white"))}>
                  {can("orders.edit") ? <button className="text-emerald-700 font-semibold hover:underline text-left" onClick={() => router.push("/orders/" + o.id)}>{o.customerName}</button> : o.customerName}
                  {(((o as any).sameCount ?? 1) >= prefs.repeatMinOrders) && <span className="ml-1 badge bg-purple-100 text-purple-700 font-bold text-[10px] px-1.5">Repeat x{(o as any).sameCount}</span>}
                  {(((o as any).sameCount ?? 1) >= prefs.vipMinOrders || ((o as any).custSpent ?? 0) >= prefs.vipMinSpent) && <span className="ml-1 badge text-white font-bold text-[10px] px-1.5" style={{background:"#f59e0b"}}>VIP</span>}
                  {(total >= prefs.highValueThreshold) && <span className="ml-1 badge text-white font-bold text-[10px] px-1.5" style={{background:"#8b5cf6"}}>High Value</span>}
                  {((o as any).custRisk) && <span className="ml-1 badge text-white font-bold text-[10px] px-1.5" style={{background:"#ef4444"}}>COD Risk</span>}
                </td>
                <td className={"px-3 py-2 sticky z-[5] " + (canBulk ? "left-[17rem]" : "left-[15.5rem]") + " " + (sel.includes(o.id) ? "bg-brand-light/40" : (rowIdx%2===1 ? "bg-slate-50" : "bg-white"))}><a className="text-sky-600 font-medium hover:underline" href={"tel:+91" + (o.contactNumber || "").replace(/\D/g, "").slice(-10)}>{o.contactNumber}</a></td>
                <td className="px-3 py-2 text-orange-600 font-medium">{o.productName||"-"}</td>
                <td className="px-3 py-2">{o.quantity}</td>
                <td className="px-3 py-2">Rs {Number(o.price)}</td>
                <td className="px-3 py-2">Rs {total}</td>
                <td className="px-3 py-2">{online ? ("Rs " + online) : "-"}</td>
                <td className="px-3 py-2 font-bold text-red-600">Rs {bal}</td>
                <td className={"px-3 py-2 sticky z-[5] " + (canBulk ? "left-[24rem]" : "left-[22.5rem]") + " " + (sel.includes(o.id) ? "bg-brand-light/40" : (rowIdx%2===1 ? "bg-slate-50" : "bg-white"))}>
                  {can("orders.changeStatus") ? (
                    <select className={"badge border-2 px-2 py-1 text-xs font-bold cursor-pointer focus:outline-none transition " + (STATUS_COLORS[o.orderStatus] ?? "bg-gray-100 text-gray-700")} style={{borderColor:shx(o.orderStatus), boxShadow:"0 0 0 2px "+shx(o.orderStatus)+"22"}} value={o.orderStatus} onChange={(e) => quickStatus(o, e.target.value)}>
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className={"badge border-2 px-2 py-1 text-xs font-bold " + (STATUS_COLORS[o.orderStatus] ?? "bg-gray-100 text-gray-700")} style={{borderColor:shx(o.orderStatus)}}>{o.orderStatus}</span>}
                </td>
                <td className="px-3 py-2">{o.paymentStatus}</td>
                <td className="px-3 py-2">{(() => { const st = typeof o.sourceTags === 'string' ? (() => { try { return JSON.parse(o.sourceTags); } catch { return []; } })() : (o.sourceTags || []); return st.length ? <span className="flex flex-wrap gap-1">{st.map((t: string) => <span key={t} className="badge bg-brand-light text-brand-dark text-[10px] px-1.5">{t}</span>)}</span> : <span className="badge text-white text-[10px]" style={{background:srcBg(o.source)}}>{o.source||"-"}</span>; })()}</td>
                <td className="px-3 py-2 text-teal-600">{o.city||"-"}</td>
                <td className="px-3 py-2">{o.state?.name ?? "-"}</td>
                <td className="px-3 py-2">{o.district?.name ?? "-"}</td>
                <td className="px-3 py-2">{o.pincode}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={o.address}>{o.address || "-"}</td>
                <td className="px-3 py-2">{d(o.followUpDate)}</td>
                <td className="px-3 py-2">{o.leadOwner?.name ?? "-"}</td>
                <td className="px-3 py-2">{d(o.agentAssignDate)}</td>
                <td className="px-3 py-2">{o.dealer?.name ?? "-"}</td>
                <td className="px-3 py-2">{d(o.dealerAssignDate)}</td>
                <td className="px-3 py-2">{o.zoneManager?.name ?? "-"}</td>
                <td className="px-3 py-2">{o.awbCode ? (<div><div className="font-medium">{o.awbCode}</div>{o.courierName ? <div className="text-[10px] text-gray-400">{o.courierName}</div> : null}</div>) : "-"}</td>
                <td className="px-3 py-2">{(o.trackingStage || o.shippingStatus) ? (<div><span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700">{o.trackingStage || o.shippingStatus}</span>{(o.rtoStatus || o.ndrStatus) ? <span className="ml-1 text-[10px] font-semibold text-red-600">{o.rtoStatus || o.ndrStatus}</span> : null}{o.lastTrackedAt ? <div className="text-[10px] text-gray-400">{dt(o.lastTrackedAt)}</div> : null}</div>) : "-"}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={o.remark ?? ""}>{o.remark ?? "-"}</td>
                <td className="px-3 py-2"><div className="flex gap-1">
                  <a className="btn btn-ghost px-2 py-1" href={"whatsapp://send?phone=91" + (o.contactNumber || "").replace(/\D/g, "").slice(-10)}>WA</a>
                  {can("orders.edit") && <button className="btn btn-ghost px-2 py-1" onClick={() => router.push("/orders/" + o.id)}>Edit</button>}
                  <a className="btn btn-ghost px-2 py-1" href={"/crm/invoice/" + o.id} target="_blank" rel="noreferrer">Inv</a>
                  {canDelete && <button className="btn btn-danger px-2 py-1" onClick={() => delOne(o)}>Del</button>}
                  {can("shiprocket.book") && !o.awbCode && <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => setBookOrder(o)}>&#128230; Book</button>}
                  {can("shiprocket.track") && o.awbCode && <button className={"btn btn-ghost px-2 py-1 text-xs" + (trackingIds.includes(o.id) ? " opacity-60" : "")} disabled={trackingIds.includes(o.id)} onClick={() => trackOne(o)}>{trackingIds.includes(o.id) ? "..." : "&#128247; Track"}</button>}
                  {can("shiprocket.label") && o.awbCode && <button className={"btn btn-ghost px-2 py-1 text-xs" + (labelIds.includes(o.id) ? " opacity-60" : "")} disabled={labelIds.includes(o.id)} onClick={() => labelOne(o)}>{labelIds.includes(o.id) ? "..." : "&#127991; Label"}</button>}
                  {can("shiprocket.track") && o.awbCode && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setShipOrder(o)}>&#128640; Details</button>}
                </div></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* spacer so fixed mobile footer never hides last rows */}
      <div className="h-20 md:hidden" />
      {/* Pagination - fixed footer on mobile (always visible) + inline on desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] md:shadow-none md:static md:border-0 md:bg-transparent mt-0 md:mt-3 px-3 py-2 md:py-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="flex items-center justify-between gap-2 text-sm flex-wrap md:flex-nowrap">
          {/* Prev */}
          <button className="btn btn-ghost min-w-[4rem] min-h-[2.5rem] md:min-h-auto text-base md:text-sm active:scale-95 transition" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">&#8592; Prev</button>
          {/* Page info + jump */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="font-semibold text-gray-700 whitespace-nowrap">Page {data?.page ?? 1} / {data?.totalPages ?? 1}</span>
            <span className="text-gray-400 hidden sm:inline text-xs">({data?.total ?? 0} orders)</span>
            {/* Jump to page - desktop only */}
            <form className="hidden md:flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const n=Number(jumpPage); const tp=data?.totalPages??1; if(n>=1&&n<=tp){setPage(n);setJumpPage("");} }}>
              <input type="number" min={1} max={data?.totalPages??1} value={jumpPage} onChange={(e)=>setJumpPage(e.target.value)} placeholder="Go to" className="input w-[4.5rem] text-xs py-1 px-2" />
              <button type="submit" className="btn btn-ghost text-xs py-1 px-2">Go</button>
            </form>
          </div>
          {/* Next */}
          <button className="btn btn-ghost min-w-[4rem] min-h-[2.5rem] md:min-h-auto text-base md:text-sm active:scale-95 transition" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)} aria-label="Next page">Next &#8594;</button>
        </div>
      </div>

      {importing && <SmartImport onClose={() => setImporting(false)} onDone={(m) => { setMsg(m); setImporting(false); refetch(); }} />}
      {bookOrder && <CourierSelectModal order={bookOrder} onClose={() => setBookOrder(null)} onConfirm={(courierId) => book(bookOrder, courierId)} />}
      {shipOrder && <ShipmentModal order={shipOrder} onClose={() => setShipOrder(null)} onRebook={(o) => { setShipOrder(null); setBookOrder(o); }} onAfter={() => refetch()} />}
      {bookResult && <BookingResultModal result={bookResult} onClose={() => setBookResult(null)} onRetry={() => { const o = bookResult.order; setBookResult(null); setBookOrder(o); }} onOpenOrder={() => { const id = bookResult.orderId; setBookResult(null); router.push("/orders/" + id); }} />}

      {assignPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAssignPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{bAgent && bAgent !== "0" ? "Assign / Reassign Confirmation" : "Unassign Confirmation"}</h3>
            <p className="text-sm text-gray-500 mb-3">{bAgent && bAgent !== "0" ? ("Lead Owner \u2192 " + (users.find((u) => String(u.id) === bAgent)?.name || ("#" + bAgent))) : "Remove lead owner from selected orders"}</p>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-2xl font-extrabold text-slate-800">{assignPreview.total}</div><div className="text-[11px] text-slate-500">Selected</div></div>
              <div className="rounded-xl bg-amber-50 p-3"><div className="text-2xl font-extrabold text-amber-700">{assignPreview.assigned}</div><div className="text-[11px] text-amber-600">Already Assigned</div></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-2xl font-extrabold text-emerald-700">{assignPreview.unassigned}</div><div className="text-[11px] text-emerald-600">Unassigned</div></div>
            </div>
            {assignPreview.single && assignPreview.single.assigned && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-3 text-sm">
                <div className="font-semibold text-amber-800">Order {assignPreview.single.orderCode} already assigned</div>
                <div className="text-amber-700">To: <b>{assignPreview.single.ownerName}</b></div>
                {assignPreview.single.assignDate && <div className="text-amber-700">On: {dt(assignPreview.single.assignDate)}</div>}
                <div className="mt-1 text-amber-800 font-medium">Reassign anyway?</div>
              </div>
            )}
            {!assignPreview.single && assignPreview.assigned > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 mb-3 max-h-40 overflow-auto text-xs">
                <div className="font-semibold text-amber-800 mb-1">{assignPreview.assigned} already assigned (will be reassigned):</div>
                {assignPreview.sample.map((s: any) => (<div key={s.id} className="flex justify-between text-amber-700"><span>{s.orderCode}</span><span>{s.ownerName}</span></div>))}
                {assignPreview.assigned > assignPreview.sample.length && <div className="text-amber-600 mt-1">+ {assignPreview.assigned - assignPreview.sample.length} more...</div>}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setAssignPreview(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmAssign}>{(assignPreview.assigned > 0 && bAgent && bAgent !== "0") ? "Reassign" : "Proceed"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}