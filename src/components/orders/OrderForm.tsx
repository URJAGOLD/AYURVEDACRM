"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { DEFAULT_CRM } from "@/lib/crmDefaults";
import { REVENUE_STATUSES } from "@/lib/statuses";
import { useAuth } from "@/store/auth";

function parseTags(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") try { return JSON.parse(v); } catch { return []; }
  return [];
}
import CourierSelectModal from "@/components/orders/CourierSelectModal";
import ShipmentModal from "@/components/orders/ShipmentModal";
import BookingResultModal from "@/components/orders/BookingResultModal";

const SRC_CHIP: Record<string, string> = {
  "Orders": "bg-green-100 text-green-700", "WhatsApp": "bg-emerald-100 text-emerald-700",
  "Abandoned Cart": "bg-amber-100 text-amber-700", "Discount Lead": "bg-purple-100 text-purple-700",
  "Meta": "bg-blue-100 text-blue-700", "Facebook": "bg-blue-100 text-blue-800", "Instagram": "bg-pink-100 text-pink-700", "Google": "bg-orange-100 text-orange-700", "Website": "bg-indigo-100 text-indigo-700", "YouTube": "bg-red-100 text-red-700", "Calling": "bg-amber-100 text-amber-700",
};

export function OrderForm({ orderId }: { orderId?: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const isEdit = !!orderId;
  const [form, setForm] = useState<any>({
    customerName: "", contactNumber: "", altMobile: "", email: "", productName: "max x7", quantity: 1, price: 999,
    totalAmount: "", onlinePaid: 0, paymentMode: "COD", address: "", city: "", pincode: "", stateId: "", districtId: "",
    source: "Calling", paymentStatus: "Pending", orderStatus: "New", remark: "", leadOwnerId: "", followUpDate: "", dealerId: "",
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sources, setSources] = useState<{ id: number; name: string }[]>([]);
  const [srcDynamic, setSrcDynamic] = useState<string[]>([]);
  const [states, setStates] = useState<{ id: number; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [hist, setHist] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [assignable, setAssignable] = useState<{ id: number; name: string }[]>([]);
  const [dealers, setDealers] = useState<{ id: number; name: string; city?: string | null; isActive: boolean }[]>([]);
  const canAssign = can("orders.assignAgent");
  const [custHist, setCustHist] = useState<any>(null);
  const [crm, setCrm] = useState<any>(null);
  const [pinMsg, setPinMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const [showCourier, setShowCourier] = useState(false);
  const [showShip, setShowShip] = useState(false);
  const [srBusy, setSrBusy] = useState(false);
  const [srMsg, setSrMsg] = useState("");
  const [bookResult, setBookResult] = useState<any>(null);
  const srMissing = useMemo(() => { const m: string[] = []; if (!String(form.customerName||"").trim()) m.push("Customer Name"); if (String(form.contactNumber||"").replace(/\D/g,"").length !== 10) m.push("Mobile (10 digits)"); if (String(form.pincode||"").replace(/\D/g,"").length !== 6) m.push("Pincode (6 digits)"); if (!String(form.city||"").trim()) m.push("City"); if (!form.stateId) m.push("State"); return m; }, [form.customerName, form.contactNumber, form.pincode, form.city, form.stateId]);

  useEffect(() => {
    api.get("/api/masters/statuses").then((r) => setStatuses(r.statuses)).catch(() => {});
    api.get("/api/settings/crm").then((r) => setCrm(r)).catch(() => {});
    api.get("/api/masters/sources").then((r) => setSources(r.sources)).catch(() => {});
    api.get("/api/orders/sources").then((r) => setSrcDynamic(r.sources || [])).catch(() => {});
    api.get("/api/masters/states").then((r) => setStates(r.states)).catch(() => {});
    api.get("/api/masters/dealers?all=1").then((r) => setDealers(r.dealers || [])).catch(() => {});
    if (can("orders.assignAgent")) api.get("/api/users/assignable").then((r) => setAssignable(r.users || [])).catch(() => {});
    if (orderId) api.get("/api/orders/" + orderId).then((d) => {
      const o = d.order; setOrder(o);
      setForm({
        customerName: o.customerName, contactNumber: o.contactNumber, altMobile: o.altMobile ?? "", email: o.email ?? "",
        productName: o.productName, quantity: o.quantity, price: Number(o.price),
        totalAmount: o.totalAmount != null ? Number(o.totalAmount) : "", onlinePaid: Number(o.onlinePaid) || 0, paymentMode: o.paymentMode || "COD",
        address: o.address, city: o.city, stateId: o.stateId ?? "", districtId: o.districtId ?? "",
        pincode: o.pincode, source: o.source, paymentStatus: o.paymentStatus, orderStatus: o.orderStatus, remark: o.remark ?? "",
        leadOwnerId: o.leadOwnerId ?? "", followUpDate: o.followUpDate ? new Date(o.followUpDate).toISOString().slice(0,10) : "", dealerId: o.dealerId ?? "",
      });
      setTags(parseTags(o.sourceTags).length ? parseTags(o.sourceTags) : (o.source ? [o.source] : []));
      setHist(o.history ?? []);
      setActivity(o.statusActivity ?? []);
    }).catch((e) => setErr(e.message));
  }, [orderId]);

  useEffect(() => { if (form.stateId) api.get("/api/masters/states/" + form.stateId + "/districts").then((r) => setDistricts(r.districts || [])).catch(() => setDistricts([])); }, [form.stateId]);
  useEffect(() => {
    const ph = String(form.contactNumber || "").replace(/\D/g, "");
    if (ph.length !== 10) { setCustHist(null); return; }
    const t = setTimeout(() => {
      api.get("/api/orders/customer-history?phone=" + ph + (orderId ? "&exclude=" + orderId : "")).then((r) => setCustHist(r)).catch(() => setCustHist(null));
    }, 400);
    return () => clearTimeout(t);
  }, [form.contactNumber, orderId]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const prefs = crm?.preferences || DEFAULT_CRM.preferences;
  const fu = crm?.followup || DEFAULT_CRM.followup;

  const qty = Number(form.quantity) || 1;
  const total = form.totalAmount !== "" && form.totalAmount != null ? Number(form.totalAmount) : Number(form.price) * qty;
  const balance = +(total - (Number(form.onlinePaid) || 0)).toFixed(2);
  const RISK_SET = ["Cancelled", "Confirm cancel", "Cancel pending", "Final cancel", "Dealer Cancel", "RTO"];
  const CONF_SET = REVENUE_STATUSES;
  const custOrders: any[] = custHist?.orders || [];
  const custSpent = custOrders.filter((o: any) => CONF_SET.includes(o.orderStatus)).reduce((sum: number, o: any) => sum + (o.totalAmount != null ? Number(o.totalAmount) : Number(o.price) * (o.quantity || 1)), 0);
  const totalCustOrders = (custHist?.count || 0) + 1;
  const isVip = totalCustOrders >= prefs.vipMinOrders || custSpent >= prefs.vipMinSpent;
  const isRisk = custOrders.some((o: any) => RISK_SET.includes(o.orderStatus));
  const isHighValue = total >= prefs.highValueThreshold;
  const stateName = useMemo(() => states.find((s) => String(s.id) === String(form.stateId))?.name || order?.state?.name || "", [states, form.stateId, order]);
  // Phase 4 #2: unified Order Timeline (milestones + clean status transitions + remark notes), newest first.
  const timeline = useMemo(() => {
    if (!isEdit) return [] as any[];
    const ev: any[] = [];
    if (order?.dateTime) ev.push({ ts: new Date(order.dateTime), icon: "\uD83D\uDD25", title: "Order created", sub: order?.source ? ("Source: " + order.source) : "", tone: "slate" });
    if (order?.agentAssignDate) ev.push({ ts: new Date(order.agentAssignDate), icon: "\uD83E\uDDD1\u200D\uD83D\uDCBC", title: "Agent assigned", sub: order?.leadOwner?.name || "", tone: "violet" });
    if (order?.dealerAssignDate) ev.push({ ts: new Date(order.dealerAssignDate), icon: "\uD83C\uDFEA", title: "Dealer assigned", sub: order?.dealer?.name || "", tone: "amber" });
    if (order?.bookedAt) ev.push({ ts: new Date(order.bookedAt), icon: "\uD83D\uDCE6", title: "Shipment booked", sub: [order?.courierName, order?.awbCode ? ("AWB " + order.awbCode) : ""].filter(Boolean).join(" \u00B7 "), tone: "red" });
    if (order?.lastTrackedAt && order?.shippingStatus) ev.push({ ts: new Date(order.lastTrackedAt), icon: "\uD83D\uDE9A", title: "Shipping: " + order.shippingStatus, sub: "", tone: "red" });
    (activity || []).forEach((a: any) => ev.push({ ts: new Date(a.changedAt), icon: "\uD83D\uDD04", title: (a.previousStatus ? a.previousStatus + " \u2192 " : "") + a.newStatus, sub: "by " + (a.changedBy?.name || (a.source === "webhook" ? "Shiprocket (system)" : "System")), tone: "status", badge: a.source }));
    (hist || []).forEach((h: any) => { if (h.remark && String(h.remark).trim()) ev.push({ ts: new Date(h.createdAt), icon: "\uD83D\uDCAC", title: String(h.remark), sub: h.addedBy?.name ? ("by " + h.addedBy.name) : "", tone: "slate" }); });
    ev.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return ev;
  }, [order, activity, hist, isEdit]);
  const districtName = useMemo(() => districts.find((s) => String(s.id) === String(form.districtId))?.name || order?.district?.name || "", [districts, form.districtId, order]);
  const sourceOptions = useMemo(() => {
    const set2 = new Set<string>();
    if (form.source) set2.add(form.source);
    srcDynamic.forEach((s) => set2.add(s));
    sources.forEach((s) => set2.add(s.name));
    if (!set2.size) set2.add("Calling");
    return Array.from(set2);
  }, [form.source, srcDynamic, sources]);

  async function onPincode(v: string) {
    set("pincode", v); setPinMsg("");
    const pin = v.replace(/\D/g, "");
    if (pin.length === 6) {
      try {
        const d = await api.get("/api/pincode/" + pin);
        if (d.found) {
          setForm((f: any) => ({ ...f, city: d.place || f.city }));
          const st = states.find((s) => s.name.toLowerCase() === String(d.state || "").toLowerCase());
          if (st) {
            set("stateId", String(st.id));
            if (d.district) {
              const dr = await api.get("/api/masters/states/" + st.id + "/districts").catch(() => ({ districts: [] }));
              const dist = (dr.districts || []).find((x: any) => String(x.name).toLowerCase() === String(d.district).toLowerCase());
              if (dist) set("districtId", String(dist.id));
            }
          }
          setPinMsg("Auto: " + [d.place, d.district, d.state].filter(Boolean).join(", "));
        } else setPinMsg("Pincode not in directory");
      } catch { /* ignore */ }
    }
  }

  function copyDetails() {
    const R = "\u20B9";
    const lines: string[] = [];
    if (order?.orderCode) lines.push("CRM ID: " + order.orderCode);
    lines.push("Name: " + (form.customerName || "-"));
    lines.push("Mobile: " + (form.contactNumber || "-"));
    if (form.altMobile) lines.push("Alternate Mobile: " + form.altMobile);
    lines.push("Address: " + [form.address, form.city, districtName, stateName, form.pincode ? "Pincode " + form.pincode : ""].filter(Boolean).join(", "));
    lines.push("");
    lines.push("Product: " + (form.productName || "Sutra Gold+"));
    lines.push("Quantity: " + qty);
    lines.push("Total Amount: " + R + total);
    lines.push("Online Paid: " + R + (Number(form.onlinePaid) || 0));
    lines.push("COD Payable: " + R + balance);
    lines.push("Payment Mode: " + (form.paymentMode || "COD"));
    lines.push("Payment Status: " + (form.paymentStatus || "Pending"));
    const txt = lines.join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  function locateMap() {
    const q = encodeURIComponent(((form.address ? form.address + " " : "") + (form.pincode || form.city || "")).trim());
    window.open("https://www.google.com/maps/search/?api=1&query=" + q, "_blank");
  }

  async function reloadOrder() {
    if (!orderId) return;
    try { const d = await api.get("/api/orders/" + orderId); setOrder(d.order); setHist(d.order.history ?? []); setActivity(d.order.statusActivity ?? []); set("orderStatus", d.order.orderStatus); } catch {}
  }
  async function bookShiprocket(courierId?: number) {
    setSrBusy(true); setSrMsg("");
    try {
      const r = await api.post("/api/shiprocket/book", { orderId: Number(orderId), courierId });
      setBookResult({ ok: true, awb: r.awb, courier: r.courier, shipmentId: r.shipmentId, warning: r.warning, orderId: Number(orderId) });
      await reloadOrder();
    } catch (e: any) { setBookResult({ ok: false, errorMsg: e?.message || "Booking failed", orderId: Number(orderId) }); }
    finally { setSrBusy(false); setShowCourier(false); }
  }
  // ---- Follow-up Date Logic (status-wise) ----
  const FU_REQUIRED = fu.requiredStatuses || [];
  const FU_LABEL: Record<string,string> = { "Callback":"Next Callback Date","Future Delivery":"Future Delivery Date","Pending":"Follow-up Date (max +2 days)","GPO Pending":"Expected Date (max +2 days)","Cancel pending":"Follow-up Date (max +2 days)","Confirm Pending":"Reminder Date (optional)" };
  const needsFollowUp = FU_REQUIRED.includes(form.orderStatus);
  const isOptional = (fu.optionalStatuses || []).includes(form.orderStatus);
  const todayStr = new Date().toISOString().slice(0,10);
  const fuMaxDays = (fu.maxDaysByStatus || {})[form.orderStatus] || 0;
  const maxDateStr = fuMaxDays > 0 ? (() => { const d=new Date(); d.setDate(d.getDate()+fuMaxDays); return d.toISOString().slice(0,10); })() : "";
  const fuLabel = FU_LABEL[form.orderStatus] || "Next Follow-up Date";

  async function save() {
    setErr(""); setSaving(true);
    // Follow-up date validation
    if (needsFollowUp && !isOptional && !form.followUpDate) { setErr(fuLabel + " is required for " + form.orderStatus + " status."); setSaving(false); return; }
    if (form.followUpDate && maxDateStr && form.followUpDate > maxDateStr) { setErr(form.orderStatus + " status: " + fuLabel + " cannot be more than " + fuMaxDays + " days from today (max: " + maxDateStr + ")."); setSaving(false); return; }
    if (form.followUpDate && form.followUpDate < todayStr) { setErr("Follow-up date cannot be in the past."); setSaving(false); return; }
    const payload: any = { ...form, totalAmount: form.totalAmount === "" ? null : Number(form.totalAmount), onlinePaid: Number(form.onlinePaid) || 0, followUpDate: form.followUpDate || null };
    if (!canAssign) delete payload.leadOwnerId;
    else payload.leadOwnerId = (form.leadOwnerId === "" || form.leadOwnerId == null) ? null : Number(form.leadOwnerId);
    payload.dealerId = (form.dealerId === "" || form.dealerId == null) ? null : Number(form.dealerId);
    try {
      if (isEdit) await api.put("/api/orders/" + orderId, payload);
      else { const r = await api.post("/api/orders", payload); if (r.duplicateWarning) alert("Warning: " + r.duplicateWarning); }
      router.push("/orders");
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  async function del() {
    if (!window.confirm("Delete this order? It will be removed from the list.")) return;
    try { await api.del("/api/orders/" + orderId); router.push("/orders"); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <button className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition" style={{background:"linear-gradient(135deg,#94a3b8,#64748b)"}} onClick={() => router.push("/orders")}>Back</button>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? ("Order " + (order?.orderCode || "")) : "New Order"}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition" style={{background:"linear-gradient(135deg,#2563EB,#1d4ed8)"}} onClick={copyDetails}>{copied ? "Copied!" : "Copy Details"}</button>
          <button className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition" style={{background:"linear-gradient(135deg,#14b8a6,#0d9488)"}} onClick={locateMap}>Locate on Map</button>
          {isEdit && <a className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition" style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)"}} href={"/crm/invoice/" + orderId} target="_blank" rel="noreferrer">Invoice</a>}
          {isEdit && can("orders.delete") && <button className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition" style={{background:"linear-gradient(135deg,#ef4444,#dc2626)"}} onClick={del}>Delete</button>}
          <button className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition disabled:opacity-60" style={{background:"linear-gradient(135deg,#22c55e,#16a34a)"}} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1 items-center">
          <span className="text-sm text-gray-500 mr-1">Sources:</span>
          {tags.map((t) => <span key={t} className={"badge text-[11px] " + (SRC_CHIP[t] ?? "bg-gray-100 text-gray-700")}>{t}</span>)}
        </div>
      )}
      {(isVip || isRisk || isHighValue) && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          {isVip && <span className="px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-sm" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>{"\u2B50"} VIP Customer</span>}
          {isHighValue && <span className="px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-sm" style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)" }}>{"\uD83D\uDC8E"} High Value</span>}
          {isRisk && <span className="px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-sm" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}>{"\u26A0\uFE0F"} COD Risk</span>}
        </div>
      )}
      {err && <div className="mb-3 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2">{err}</div>}

      {custHist && totalCustOrders >= prefs.repeatMinOrders && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge bg-amber-200 text-amber-800 text-[11px]">Repeat Customer</span>
            <span className="text-sm font-semibold text-amber-800">{custHist.count} previous order{custHist.count > 1 ? "s" : ""}</span>
            {!isEdit && <span className="text-xs text-red-600 font-medium">- is number ka order pehle se hai, naya mat banaiye; niche se kholiye</span>}
          </div>
          <div className="mt-1 text-xs text-gray-700 flex flex-wrap gap-x-4 gap-y-0.5">
            {custHist.summary?.lastProduct && <span>Last product: {custHist.summary.lastProduct}</span>}
            {custHist.summary?.leadOwnerName && <span>Lead Owner: {custHist.summary.leadOwnerName}</span>}
            {custHist.summary?.totalOnlinePaid > 0 && <span>Online paid (all): Rs {custHist.summary.totalOnlinePaid}</span>}
            {custHist.summary?.lastFollowUp && <span>Last follow-up: {new Date(custHist.summary.lastFollowUp).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>}
          </div>
          <div className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-auto">
            {custHist.orders.map((h: any) => (
              <button key={h.id} type="button" onClick={() => router.push("/orders/" + h.id)} className="text-left text-xs text-brand-dark hover:underline">
                {h.orderCode} - {new Date(h.dateTime).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} - {h.productName} - {h.orderStatus} - Rs {Number(h.totalAmount ?? h.price)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
        <div className="card p-4">
          <div className="-mx-4 -mt-4 mb-4 px-4 py-3 rounded-t-xl text-white font-bold flex items-center gap-2 shadow-sm" style={{background:"linear-gradient(135deg,#2563EB,#06B6D4)"}}><span>{"\uD83D\uDC64"}</span>Customer & Order</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <F label="Customer Name"><input className="input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></F>
            <div className="border-l-[3px] pl-2" style={{borderColor:"#3b82f6"}}><label className="label" style={{color:"#3b82f6"}}>Contact Number</label><input className="input" value={form.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} placeholder="10 digits" />{String(form.contactNumber || "").replace(/\D/g, "").length >= 10 && <a className="text-[11px] text-brand-dark hover:underline" href={"tel:+91" + String(form.contactNumber).replace(/\D/g, "").slice(-10)}>Call this number</a>}</div>
            <F label="Alternate Mobile (optional)"><input className="input" value={form.altMobile} onChange={(e) => set("altMobile", e.target.value)} placeholder="10 digits" /></F>
            <F label="Email (optional)"><input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} /></F>
            <F label="Product"><input className="input" value={form.productName} onChange={(e) => set("productName", e.target.value)} /></F>
            <F label="Quantity"><input className="input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></F>
            <div className="md:col-span-2"><F label="Address"><textarea className="input" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></F></div>
            <div>
              <label className="label" style={{color:"#6366f1"}}>Pincode</label>
              <input className="input" value={form.pincode} onChange={(e) => onPincode(e.target.value)} placeholder="6 digits" />
              {pinMsg && <p className="text-[10px] text-emerald-600 mt-0.5">{pinMsg}</p>}
            </div>
            <F label="City"><input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} /></F>
            <F label="State"><select className="input" value={form.stateId} onChange={(e) => { set("stateId", e.target.value); set("districtId", ""); }}><option value="">-</option>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
            <F label="District"><select className="input" value={form.districtId} onChange={(e) => set("districtId", e.target.value)}><option value="">-</option>{districts.map((dd) => <option key={dd.id} value={dd.id}>{dd.name}</option>)}</select></F>
            <F label="Source"><select className="input" value={form.source} onChange={(e) => set("source", e.target.value)}>{sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
            <F label="Status"><select className="input" value={form.orderStatus} onChange={(e) => { set("orderStatus", e.target.value); set("followUpDate", ""); }}>{(form.orderStatus && !statuses.includes(form.orderStatus) ? [form.orderStatus, ...statuses] : statuses).map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
            {needsFollowUp && (
              <div className={"md:col-span-2 rounded-xl border-2 p-3 " + (form.orderStatus === "Callback" ? "border-orange-300 bg-orange-50" : form.orderStatus === "Future Delivery" ? "border-blue-300 bg-blue-50" : "border-amber-300 bg-amber-50")}>
                <label className={"block text-xs font-bold mb-1 " + (form.orderStatus === "Callback" ? "text-orange-700" : form.orderStatus === "Future Delivery" ? "text-blue-700" : "text-amber-700")}>
                  {isOptional ? "🔔 " : "📅 "}{fuLabel}{!isOptional && <span className="text-red-500 ml-1">*</span>}
                  {maxDateStr && <span className="ml-2 text-xs font-normal text-gray-400">(Today to {maxDateStr})</span>}
                </label>
                <input type="date" className="input w-full" value={form.followUpDate} min={todayStr} max={maxDateStr || undefined} onChange={(e) => set("followUpDate", e.target.value)} />
                {form.followUpDate && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Selected: <b>{new Date(form.followUpDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b></span>
                    <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => set("followUpDate", "")}>Clear</button>
                  </div>
                )}
              </div>
            )}
            {!needsFollowUp && form.followUpDate && (
              <div className="md:col-span-2 text-xs text-gray-400 flex items-center gap-2">
                <span>Existing follow-up: <b>{new Date(form.followUpDate + "T00:00:00").toLocaleDateString("en-IN")}</b></span>
                <button type="button" className="text-red-400 hover:underline" onClick={() => set("followUpDate", "")}>Clear</button>
              </div>
            )}
            <div className="md:col-span-2"><F label="Remark"><textarea className="input" rows={2} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></F></div>
          </div>
        </div>

        {isEdit && (
          <div className="card p-4">
            <div className="-mx-4 -mt-4 mb-3 px-4 py-3 rounded-t-xl text-white font-bold flex items-center gap-2 shadow-sm" style={{background:"linear-gradient(135deg,#7c3aed,#2563eb)"}}><span>{"\uD83D\uDCDC"}</span>Order Timeline</div>
            <div className="max-h-96 overflow-auto pr-1">
              {timeline.length === 0 && <p className="text-xs text-gray-400 p-3">Abhi koi activity nahi. Order create, assign, har status-change aur shipping update yahan ek hi jagah, sabse naya upar dikhega.</p>}
              {timeline.length > 0 && (() => {
                const DOT: Record<string,string> = { slate:"#94a3b8", violet:"#8b5cf6", amber:"#f59e0b", red:"#ef4444", status:"#0ea5e9" };
                const SRC: Record<string,string> = { manual:"bg-blue-100 text-blue-700", bulk:"bg-purple-100 text-purple-700", webhook:"bg-emerald-100 text-emerald-700" };
                return (
                  <ol className="relative border-l-2 border-gray-200 ml-3 space-y-3 py-1">
                    {timeline.map((e: any, i: number) => (
                      <li key={i} className="ml-4 relative">
                        <span className="absolute rounded-full ring-2 ring-white" style={{ width:10, height:10, left:-21, top:3, background: DOT[e.tone] || "#94a3b8" }} />
                        <div className="flex justify-between gap-2 items-start">
                          <span className="font-semibold text-xs text-gray-900 break-words">{e.icon} {e.title}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{new Date(e.ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                          {e.badge && <span className={"badge text-[10px] " + (SRC[e.badge] ?? "bg-gray-100 text-gray-700")}>{e.badge}</span>}
                          {e.sub && <span className="text-[11px] text-gray-500 break-words">{e.sub}</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          </div>
        )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="-mx-4 -mt-4 mb-4 px-4 py-3 rounded-t-xl text-white font-bold flex items-center gap-2 shadow-sm" style={{background:"linear-gradient(135deg,#22C55E,#16A34A)"}}><span>{"\uD83D\uDCB0"}</span>Payment Information</div>
            <div className="space-y-3">
              <F label="Unit Price (Rs)"><input className="input" type="number" value={form.price} onChange={(e) => set("price", e.target.value)} /></F>
              <F label="Total Amount (Rs)"><input className="input" type="number" value={form.totalAmount} onChange={(e) => set("totalAmount", e.target.value)} placeholder={"auto: " + (Number(form.price) * qty)} /></F>
              <F label="Online Payment Received (Rs)"><input className="input" type="number" value={form.onlinePaid} onChange={(e) => set("onlinePaid", e.target.value)} /></F>
              <div className="rounded-lg px-3 py-3 flex items-center justify-between border-2" style={{background: balance>0?"#fef2f2":"#f0fdf4", borderColor: balance>0?"#fecaca":"#bbf7d0"}}>
                <span className={"text-sm font-bold " + (balance>0?"text-red-700":"text-green-700")}>Balance / COD Collectable</span>
                <span className={"text-xl font-extrabold " + (balance>0?"text-red-600":"text-green-600")}>Rs {balance}</span>
              </div>
              <F label="Payment Mode"><select className="input" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)}><option>COD</option><option>Prepaid</option><option>Partial</option></select></F>
              <F label="Payment Status"><select className="input" value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}><option>Pending</option><option>Completed</option></select></F>
            </div>
          </div>

          {isEdit && (
            <div className="card p-4">
              <div className="-mx-4 -mt-4 mb-4 px-4 py-3 rounded-t-xl text-white font-bold flex items-center gap-2 shadow-sm" style={{background:"linear-gradient(135deg,#ef4444,#b91c1c)"}}><span>{"\uD83D\uDE9A"}</span>Shiprocket</div>
              {order?.awbCode ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Courier</span><span className="font-semibold text-gray-800">{order.courierName || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">AWB</span><span className="font-mono font-semibold text-gray-800">{order.awbCode}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Shipment ID</span><span className="font-mono text-gray-700">{order.shipmentId || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{order.trackingStage || order.shippingStatus || "Booked"}</span></div>
                  {(order.rtoStatus || order.ndrStatus) && <div className="flex justify-between"><span className="text-gray-500">Flag</span><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{order.rtoStatus || order.ndrStatus}</span></div>}
                  {order.expectedDelivery && <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="text-gray-700">{new Date(order.expectedDelivery).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span></div>}
                  {order.lastTrackedAt && <div className="text-[10px] text-gray-400 text-right">Last update: {new Date(order.lastTrackedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {can("shiprocket.track") && <button type="button" onClick={() => setShowShip(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Track / Manage</button>}
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(order.awbCode); setSrMsg("AWB copied"); }} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Copy AWB</button>
                    <a href={"https://shiprocket.co/tracking/" + order.awbCode} target="_blank" rel="noreferrer" className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Tracking Link</a>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {srMissing.length > 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      <div className="font-semibold">{"\u26A0\uFE0F"} Booking Blocked - missing:</div>
                      <ul className="mt-1 list-disc pl-4">{srMissing.map((x) => <li key={x}>{x}</li>)}</ul>
                      <div className="mt-1">Inhe bharein aur Save karein, phir Book karein.</div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">{"\u2705"} Ready to book - saari required fields bhari hui hain.</div>
                  )}
                  {can("shiprocket.book") ? (
                    <button type="button" disabled={srBusy || srMissing.length > 0} onClick={() => setShowCourier(true)} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">{srBusy ? "Booking..." : "Book with Shiprocket"}</button>
                  ) : <p className="text-xs text-gray-400">Booking permission nahi hai.</p>}
                </div>
              )}
              {srMsg && <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">{srMsg}</div>}
            </div>
          )}
          <div className="card p-4">
            <div className="-mx-4 -mt-4 mb-4 px-4 py-3 rounded-t-xl text-white font-bold flex items-center gap-2 shadow-sm" style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)"}}><span>{"\uD83D\uDCBC"}</span>Lead Assignment</div>
            {canAssign ? (
              <F label="Lead Owner (assign / change)">
                <select className="input" value={form.leadOwnerId} onChange={(e) => set("leadOwnerId", e.target.value)}>
                  <option value="">Not assigned</option>
                  {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </F>
            ) : (
              <div>
                <label className="label">Lead Owner</label>
                <p className="text-sm font-medium text-gray-800 px-1 py-2">{order?.leadOwner?.name || "Not assigned"}</p>
              </div>
            )}
            <div className="mt-3">
              <F label="Dealer (optional)">
                <select className="input" value={form.dealerId} onChange={(e) => set("dealerId", e.target.value)}>
                  <option value="">No dealer</option>
                  {dealers.filter((d) => d.isActive || String(d.id) === String(form.dealerId)).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.city ? " (" + d.city + ")" : ""}{!d.isActive ? " (disabled)" : ""}</option>
                  ))}
                </select>
              </F>
            </div>
            {isEdit && order?.dealerAssignDate && <p className="text-[11px] text-gray-400 mt-1">Dealer assigned: {new Date(order.dealerAssignDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
            {isEdit && order?.agentAssignDate && <p className="text-[11px] text-gray-400 mt-1">Assigned: {new Date(order.agentAssignDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
          </div>

          {/* Lead Timeline merged into the unified Order Timeline card (left column). */}
        </div>
      </div>
      {showCourier && order && <CourierSelectModal order={order} onClose={() => setShowCourier(false)} onConfirm={(courierId) => bookShiprocket(courierId)} />}
      {showShip && order && <ShipmentModal order={order} onClose={() => setShowShip(false)} onRebook={() => { setShowShip(false); setShowCourier(true); }} onAfter={() => reloadOrder()} />}
      {bookResult && <BookingResultModal result={bookResult} onClose={() => setBookResult(null)} onRetry={() => { setBookResult(null); setShowCourier(true); }} onOpenOrder={() => setBookResult(null)} />}
    </div>
  );
}
const FIELD_ACCENT: Record<string, string> = {"Customer Name":"#22c55e","Alternate Mobile (optional)":"#06b6d4","Email (optional)":"#8b5cf6","Product":"#f97316","Quantity":"#f97316","Address":"#14b8a6","City":"#0ea5e9","State":"#1d4ed8","District":"#7c3aed","Source":"#22c55e","Status":"#f97316","Remark":"#64748b","Unit Price (Rs)":"#16a34a","Total Amount (Rs)":"#16a34a","Online Payment Received (Rs)":"#2563eb","Payment Mode":"#16a34a","Payment Status":"#16a34a","Lead Owner (assign / change)":"#8b5cf6"};
function F({ label, children }: { label: string; children: React.ReactNode }) {
  const a = FIELD_ACCENT[label];
  return <div className={a ? "border-l-[3px] pl-2" : ""} style={a ? { borderColor: a } : undefined}><label className="label" style={a ? { color: a } : undefined}>{label}</label>{children}</div>;
}
