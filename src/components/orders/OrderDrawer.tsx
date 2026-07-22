"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import type { Order } from "@/types";

function parseTags(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") try { return JSON.parse(v); } catch { return []; }
  return [];
}

interface Props {
  order: Order | null;
  statuses: string[];
  sources: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const SRC_CHIP: Record<string, string> = {
  "Orders": "bg-green-100 text-green-700",
  "WhatsApp": "bg-emerald-100 text-emerald-700",
  "Abandoned Cart": "bg-amber-100 text-amber-700",
  "Discount Lead": "bg-purple-100 text-purple-700",
};

export function OrderDrawer({ order, statuses, sources, onClose, onSaved }: Props) {
  const isEdit = !!order;
  const [form, setForm] = useState<any>({
    customerName: "", contactNumber: "", productName: "max x7", quantity: 1, price: 999,
    address: "", city: "", pincode: "", source: "Calling", paymentStatus: "Pending", orderStatus: "New", remark: "",
  });
  const [states, setStates] = useState<{ id: number; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [hist, setHist] = useState<any[]>([]);
  const [pinMsg, setPinMsg] = useState("");
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/masters/states").then((d) => setStates(d.states)).catch(() => {});
    if (order) {
      setForm({
        customerName: order.customerName, contactNumber: order.contactNumber, email: order.email ?? "",
        productName: order.productName, quantity: order.quantity, price: Number(order.price),
        address: order.address, city: order.city, stateId: order.stateId ?? "", districtId: order.districtId ?? "",
        pincode: order.pincode, source: order.source, paymentStatus: order.paymentStatus, orderStatus: order.orderStatus, remark: order.remark ?? "",
      });
      setTags(parseTags(order.sourceTags).length ? parseTags(order.sourceTags) : (order.source ? [order.source] : []));
      api.get("/api/orders/" + order.id).then((d) => {
        setHist(d.order?.history ?? []);
        const t = parseTags(d.order?.sourceTags);
        if (t.length) setTags(t);
      }).catch(() => {});
    }
  }, [order]);

  useEffect(() => { if (form.stateId) api.get("/api/masters/states/" + form.stateId + "/districts").then((d) => setDistricts(d.districts)).catch(() => setDistricts([])); }, [form.stateId]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function onPincode(v: string) {
    set("pincode", v); setPinMsg("");
    const pin = v.replace(/\D/g, "");
    if (pin.length === 6) {
      try {
        const d = await api.get("/api/pincode/" + pin);
        if (d.found) {
          setForm((f: any) => ({ ...f, city: f.city || d.place || f.city }));
          const st = states.find((s) => s.name.toLowerCase() === String(d.state || "").toLowerCase());
          if (st) set("stateId", String(st.id));
          setPinMsg("Auto: " + [d.place, d.district, d.state].filter(Boolean).join(", "));
        } else setPinMsg("Pincode not in directory");
      } catch { /* ignore */ }
    }
  }

  async function save() {
    setErr(""); setSaving(true);
    try {
      if (isEdit) await api.put("/api/orders/" + order!.id, form);
      else { const r = await api.post("/api/orders", form); if (r.duplicateWarning) alert("Warning: " + r.duplicateWarning); }
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">{isEdit ? ("Edit " + order!.orderCode) : "New Order"}</h2>
          <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>X</button>
        </div>
        <div className="p-5 space-y-3">
          {tags.length > 0 && (
            <div>
              <label className="label">Sources</label>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => <span key={t} className={"badge text-[11px] " + (SRC_CHIP[t] ?? "bg-gray-100 text-gray-700")}>{t}</span>)}
              </div>
            </div>
          )}
          <F label="Customer Name"><input className="input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></F>
          <F label="Contact Number"><input className="input" value={form.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} placeholder="10 digits" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Product"><input className="input" value={form.productName} onChange={(e) => set("productName", e.target.value)} /></F>
            <F label="Qty"><input className="input" type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Price"><input className="input" type="number" value={form.price} onChange={(e) => set("price", e.target.value)} /></F>
            <F label="Payment"><select className="input" value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}><option>Pending</option><option>Completed</option></select></F>
          </div>
          <F label="Address"><textarea className="input" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="City"><input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} /></F>
            <div>
              <label className="label">Pincode</label>
              <input className="input" value={form.pincode} onChange={(e) => onPincode(e.target.value)} placeholder="6 digits" />
              {pinMsg && <p className="text-[10px] text-emerald-600 mt-0.5">{pinMsg}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="State"><select className="input" value={form.stateId} onChange={(e) => set("stateId", e.target.value)}><option value="">-</option>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
            <F label="District"><select className="input" value={form.districtId} onChange={(e) => set("districtId", e.target.value)}><option value="">-</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Source"><select className="input" value={form.source} onChange={(e) => set("source", e.target.value)}>{sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></F>
            <F label="Status"><select className="input" value={form.orderStatus} onChange={(e) => set("orderStatus", e.target.value)}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
          </div>
          <F label="Remark"><textarea className="input" rows={2} value={form.remark} onChange={(e) => set("remark", e.target.value)} /></F>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary flex-1" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save"}</button>
          </div>

          {isEdit && (
            <div className="pt-3 border-t">
              <label className="label">Lead Timeline</label>
              <div className="border rounded-lg divide-y max-h-64 overflow-auto bg-gray-50">
                {hist.length === 0 && <p className="text-xs text-gray-400 p-3">No timeline yet</p>}
                {hist.map((h: any) => (
                  <div key={h.id} className="p-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-gray-800">{h.status}</span>
                      <span className="text-gray-400 shrink-0">{new Date(h.createdAt).toLocaleString("en-IN")}</span>
                    </div>
                    {h.remark && <p className="text-gray-600 mt-0.5 break-words">{h.remark}</p>}
                    {h.addedBy?.name && <p className="text-[10px] text-gray-400 mt-0.5">by {h.addedBy.name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
