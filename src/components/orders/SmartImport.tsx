"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";

const FIELDS: { key: string; label: string; req?: boolean }[] = [
  { key: "CustomerName", label: "Name", req: true },
  { key: "ContactNumber", label: "Mobile", req: true },
  { key: "ProductName", label: "Product" },
  { key: "Quantity", label: "Qty" },
  { key: "Price", label: "Price" },
  { key: "Address", label: "Address" },
  { key: "City", label: "City" },
  { key: "State", label: "State" },
  { key: "District", label: "District" },
  { key: "Pincode", label: "Pincode" },
  { key: "Source", label: "Source" },
  { key: "PaymentStatus", label: "Payment" },
  { key: "Remark", label: "Remark" },
];

type Col = { index: number; header: string; samples: string[] };

export function SmartImport({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "map" | "busy">("pick");
  const [err, setErr] = useState("");
  const [columns, setColumns] = useState<Col[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [defaultSource, setDefaultSource] = useState("Bulk Import");
  const [defaultProduct, setDefaultProduct] = useState("Sutra Gold+");
  // Phase 3B: Def. Source ab dropdown hai (active sources se) - free-text se duplicate sources ban jaate the.
  const [srcOpts, setSrcOpts] = useState<string[]>([]);
  useEffect(() => {
    api.get("/api/masters/sources").then((r) => setSrcOpts((r.sources || []).map((s: any) => s.name))).catch(() => {});
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(""); setStep("busy");
    try {
      const r = await api.upload("/api/orders/import/analyze", f);
      setColumns(r.columns); setRows(r.rows); setMapping(r.mapping); setStep("map");
    } catch (e: any) { setErr(e.message); setStep("pick"); }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function doImport() {
    setErr(""); setStep("busy");
    try {
      const r = await api.post("/api/orders/import/commit", { rows, mapping, defaultSource, defaultProduct });
      onDone("Imported " + r.createdCount + ", failed " + r.failedCount);
    } catch (e: any) { setErr(e.message); setStep("map"); }
  }
  const setMap = (field: string, val: string) => setMapping((m) => ({ ...m, [field]: val === "" ? null : Number(val) }));
  const colLabel = (c: Col) => { const s = c.samples.find((x) => x); return c.header + (s ? "  (e.g. " + s + ")" : ""); };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Smart Import (Excel / CSV)</h2>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        {err && <div className="mb-3 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2">{err}</div>}

        {step === "pick" && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600 mb-4">Koi bhi Excel (.xlsx) ya CSV file chuniye. System khud columns pehchanega, phir aap confirm aur edit kar sakte hain.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose File</button>
          </div>
        )}

        {step === "busy" && <div className="py-10 text-center text-gray-400">Processing...</div>}

        {step === "map" && (
          <>
            <p className="text-sm text-gray-600 mb-3">System ne columns auto-detect kiye. Galat ho to dropdown se theek kar dijiye. Name aur Mobile zaroori hain.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="text-sm w-24 shrink-0 text-gray-700">{f.label}{f.req ? " *" : ""}</label>
                  <select className="input" value={mapping[f.key] ?? ""} onChange={(e) => setMap(f.key, e.target.value)}>
                    <option value="">-- not mapped --</option>
                    {columns.map((c) => <option key={c.index} value={c.index}>{colLabel(c)}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              <div className="flex items-center gap-2"><label className="text-sm w-24 shrink-0 text-gray-700">Def. Source</label>
                <select className="input" value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}>
                  {!srcOpts.includes(defaultSource) && <option value={defaultSource}>{defaultSource}</option>}
                  {srcOpts.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2"><label className="text-sm w-24 shrink-0 text-gray-700">Def. Product</label><input className="input" value={defaultProduct} onChange={(e) => setDefaultProduct(e.target.value)} /></div>
            </div>

            <div className="text-xs text-gray-500 mb-1">Preview (pehli 4 rows, mapping ke hisaab se):</div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg mb-4">
              <table className="text-xs">
                <thead className="bg-gray-50"><tr>{FIELDS.map((f) => <th key={f.key} className="px-2 py-1 text-left whitespace-nowrap text-gray-500">{f.label}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 4).map((r, ri) => (
                    <tr key={ri} className="border-t border-gray-100">
                      {FIELDS.map((f) => { const i = mapping[f.key]; return <td key={f.key} className="px-2 py-1 whitespace-nowrap">{i == null ? "" : (r[i] ?? "")}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setStep("pick")}>Back</button>
              <button className="btn btn-primary" onClick={doImport}>Import {rows.length} rows</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}