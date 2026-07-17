"use client";
import { useState } from "react";

export type BookResult = {
  ok: boolean;
  awb?: string | null;
  courier?: string | null;
  shipmentId?: string | null;
  warning?: string;
  errorMsg?: string;
  orderId: number;
  order?: any;
};

// Map raw Shiprocket / API error strings to a friendly title + detail + fix (spec #2)
export function parseBookingError(raw: string): { title: string; detail: string; fix: string } {
  const m = (raw || "").toLowerCase();
  if (m.includes("required fields missing") || m.includes("validation failed")) {
    const fields = (raw.split(/missing[:-]/i)[1] || "").split(".")[0].trim();
    return { title: "Missing Required Fields", detail: "In fields ke bina booking nahi ho sakti: " + (fields || raw), fix: "Order kholein -> ye fields bharein -> Save -> dobara Book karein." };
  }
  if (m.includes("wrong pickup") || m.includes("pickup location")) {
    return { title: "Invalid Pickup Location", detail: "Shiprocket ne is pickup location ko accept nahi kiya.", fix: "Shiprocket Settings -> Sync Pickup -> sahi location chunein -> retry." };
  }
  if (m.includes("already booked")) {
    return { title: "Already Booked", detail: raw, fix: "Yeh order pehle se book hai. Tracking ke liye 'Track / Manage' use karein." };
  }
  if (m.includes("not serviceable") || m.includes("serviceab")) {
    return { title: "Courier Not Serviceable", detail: "Is pincode par chuna gaya courier deliver nahi karta.", fix: "Rebook karein aur 'Auto' ya doosra courier chunein." };
  }
  if (m.includes("awb")) {
    return { title: "AWB Not Assigned", detail: raw, fix: "Courier ne reject kiya ho sakta hai. Doosre courier ke saath Rebook karein." };
  }
  if (m.includes("authentication") || m.includes("unauthorized") || m.includes("login")) {
    return { title: "Authentication Failed", detail: "Shiprocket login fail hua.", fix: "Shiprocket Settings me account credentials Test karein." };
  }
  if (m.includes("no shipment id") || m.includes("order creation failed") || m.includes("creation failed")) {
    return { title: "Shiprocket Order Creation Failed", detail: raw, fix: "Address / Pincode / State sahi karein, Pickup location verify karein, phir retry." };
  }
  if (m.includes("mobile") || m.includes("phone")) {
    return { title: "Invalid Mobile Number", detail: raw, fix: "10-digit valid mobile number bharein -> Save -> retry." };
  }
  if (m.includes("pincode") || m.includes("pin code")) {
    return { title: "Invalid Pincode", detail: raw, fix: "6-digit valid pincode bharein -> Save -> retry." };
  }
  return { title: "Booking Failed", detail: raw || "Unknown error", fix: "Order details verify karein aur dobara Book karein. Problem rahe to Audit Logs dekhein." };
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{k}</span>
      <span className={"font-semibold text-gray-800 " + (mono ? "font-mono" : "")}>{v}</span>
    </div>
  );
}

export default function BookingResultModal({ result, onClose, onRetry, onOpenOrder }: {
  result: BookResult; onClose: () => void; onRetry: () => void; onOpenOrder: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const success = result.ok && !!result.awb;
  const pending = result.ok && !result.awb;
  const err = !result.ok ? parseBookingError(result.errorMsg || "") : null;
  const copyAwb = () => { if (result.awb) { navigator.clipboard?.writeText(result.awb); setCopied(true); setTimeout(() => setCopied(false), 1600); } };
  const track = () => { if (result.awb) window.open("https://shiprocket.co/tracking/" + result.awb, "_blank"); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={"rounded-t-2xl px-5 py-4 text-base font-bold text-white " + (success ? "bg-emerald-600" : pending ? "bg-amber-500" : "bg-red-600")}>
          {success ? "\u2705 Shipment Booked Successfully" : pending ? "\u26A0\uFE0F Order Created - AWB Pending" : "\u274C " + (err?.title || "Booking Failed")}
        </div>
        <div className="space-y-3 p-5 text-sm">
          {success && (
            <>
              <Row k="Courier" v={result.courier || "-"} />
              <Row k="AWB" v={result.awb || "-"} mono />
              <Row k="Shipment ID" v={result.shipmentId || "-"} mono />
            </>
          )}
          {pending && (
            <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
              <p className="font-medium">{result.warning || "Order Shiprocket par ban gaya par AWB abhi assign nahi hua."}</p>
              {result.shipmentId && <p className="mt-1 text-xs">Shipment ID: <span className="font-mono">{result.shipmentId}</span></p>}
              <p className="mt-1 text-xs">Doosre courier ke saath Rebook karein.</p>
            </div>
          )}
          {err && (
            <>
              <div className="rounded-lg bg-red-50 p-3 text-red-700"><div className="font-semibold">Reason</div><div className="mt-0.5 break-words">{err.detail}</div></div>
              <div className="rounded-lg bg-blue-50 p-3 text-blue-700"><div className="font-semibold">How to Fix</div><div className="mt-0.5">{err.fix}</div></div>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          {success && <button onClick={copyAwb} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">{copied ? "Copied!" : "Copy AWB"}</button>}
          {success && <button onClick={track} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Track Shipment</button>}
          {pending && <button onClick={onRetry} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">Rebook</button>}
          {err && <button onClick={onOpenOrder} className="rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800">Open Order</button>}
          {err && <button onClick={onRetry} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Retry Booking</button>}
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}