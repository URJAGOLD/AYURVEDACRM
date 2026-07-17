"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/apiClient";

const GST_PCT = 5;
const DEF_HSN = "30049011";
const DEF_ITEM = "KSG";
const COMPANY = "AYURVEDA";
const GSTIN = "0";
const STATE_CODE = "8";

function wordsIndian(n: number): string {
  n = Math.round(n);
  if (n === 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => x < 20 ? a[x] : (b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
  const three = (x: number) => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " : "") : "") + (x % 100 ? two(x % 100) : "");
  let out = "";
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const la = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  if (cr) out += three(cr) + " Crore ";
  if (la) out += three(la) + " Lakh ";
  if (th) out += three(th) + " Thousand ";
  if (n) out += three(n);
  return out.trim().replace(/\s+/g, " ") + " Rupees Only";
}

const CSS = `
.inv-toolbar{max-width:820px;margin:14px auto;display:flex;gap:10px;justify-content:flex-end;padding:0 10px;}
.inv-toolbar button{padding:9px 16px;border:0;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;}
.inv-btn-dl{background:#14532d;color:#fff;} .inv-btn-pr{background:#e5e7eb;color:#111;}
.inv-sheet{max-width:820px;margin:0 auto 30px;background:#fff;padding:26px 30px;border:2px solid #000;color:#000;font-family:Arial,Helvetica,sans-serif;}
.inv-sheet .c{text-align:center;}
.inv-sheet h1{font-size:17px;margin:0 0 2px;letter-spacing:.3px;}
.inv-sheet .sub{font-size:12px;margin:1px 0;}
.inv-sheet table{width:100%;border-collapse:collapse;margin-top:12px;}
.inv-sheet td,.inv-sheet th{border:1px solid #000;padding:6px 8px;font-size:12px;vertical-align:top;}
.inv-sheet th{background:#f2f2f2;text-align:left;font-weight:700;}
.inv-sheet .sec{font-weight:700;background:#f2f2f2;}
.inv-sheet .r{text-align:right;} .inv-sheet .b{font-weight:700;}
.inv-sheet .small{font-size:11px;line-height:1.45;}
.inv-sheet .foot td{text-align:center;font-size:11px;}
.inv-partial{background:#fff7ed;}
@media print{.inv-toolbar{display:none;} .inv-sheet{border:2px solid #000;margin:0;max-width:100%;} @page{size:A4;margin:10mm;}}
`;

export default function InvoicePage() {
  const params = useParams();
  const id = (params && (params as any).id) as string;
  const [o, setO] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (id) api.get("/api/orders/" + id).then((d) => setO(d.order)).catch((e) => setErr(e.message || "Error"));
  }, [id]);

  if (err) return <div style={{ padding: 24 }}>Error: {err}</div>;
  if (!o) return <div style={{ padding: 24 }}>Loading invoice...</div>;

  const qty = Number(o.quantity) || 1;
  const total = o.totalAmount != null ? Number(o.totalAmount) : Number(o.price) * qty;
  const onlinePaid = Number(o.onlinePaid) || 0;
  const balance = +(total - onlinePaid).toFixed(2);
  const igstAmt = +(total * GST_PCT / (100 + GST_PCT)).toFixed(2);
  const unitIncl = +(total / qty).toFixed(2);
  const orderNo = o.orderCode || "";
  const invNo = "PH/INV/" + String(orderNo).replace(/\D/g, "");
  const dt = o.dateTime ? new Date(o.dateTime) : new Date();
  const invDate = dt.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const addr = [o.address, o.city, o.district?.name, o.state?.name].filter(Boolean).join(", ") + (o.pincode ? ", Pincode: " + o.pincode : "");
  const mapQ = encodeURIComponent(((o.address ? o.address + " " : "") + (o.pincode || "")).trim() || (o.city || ""));
  const mapLink = "https://www.google.com/maps/search/?api=1&query=" + mapQ;
  const pmode = o.paymentMode || "COD";
  const pmodeLabel = /cod|cash/i.test(pmode) ? "(Cash On Delivery)" : pmode;
  const partial = onlinePaid > 0;
  const product = o.productName || "Sutra Gold+";
  const hsn = DEF_HSN;
  const itemCode = o.productSku || DEF_ITEM;

  async function downloadPdf() {
    const w = window as any;
    if (!w.html2pdf) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        s.onload = res; s.onerror = rej; document.body.appendChild(s);
      }).catch(() => {});
    }
    const el = document.getElementById("sheet");
    if (w.html2pdf && el) {
      w.html2pdf().set({ margin: 6, filename: "Invoice-" + orderNo + ".pdf", image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } }).from(el).save();
    } else { window.print(); }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="inv-toolbar">
        <button className="inv-btn-dl" onClick={downloadPdf}>Download PDF</button>
        <button className="inv-btn-pr" onClick={() => window.print()}>Print</button>
      </div>
      <div className="inv-sheet" id="sheet">
        <div className="c">
          <h1>{COMPANY}</h1>
          <div className="sub">GST Number : {GSTIN}</div>
          <div className="sub">State Code : {STATE_CODE}</div>
        </div>

        <table>
          <tbody>
            <tr>
              <td style={{ width: "38%" }}><span className="b">Payment Terms:</span> {pmode}</td>
              <td className="c" style={{ width: "40%" }}>{pmodeLabel}</td>
              <td className="r"><span className="b">Qty:</span> {qty}</td>
            </tr>
            <tr><td colSpan={3}><span className="b">COD collectable amount :</span> {balance.toFixed(2)}</td></tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <td style={{ width: "60%" }}><span className="b">Invoice Date</span><br />{invDate}<br /><br /><span className="b">Order No:</span><br />{orderNo}</td>
              <td className="r"><span className="b">Invoice No:</span> {invNo}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr><td className="sec">Customer Details</td></tr>
            <tr><td>
              <div className="b">{o.customerName}</div>
              <div className="b small">Contact No {o.contactNumber}</div>
              {o.altMobile ? <div className="b small">Alternate No {o.altMobile}</div> : null}
              <div className="small"><span className="b">Address:</span> {addr}</div>
              <div className="small"><span className="b">Amount:</span> Rs {total} ({/cod|cash/i.test(pmode) ? "COD" : pmode}) &nbsp; <a href={mapLink} target="_blank" rel="noreferrer">Map Location</a></div>
            </td></tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr><th style={{ width: "50%" }}>Product Name</th><th style={{ width: "28%" }}>HSN Code</th><th>Item code</th></tr>
            <tr><td className="b">{product}</td><td>{hsn}</td><td>{itemCode}</td></tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr><th style={{ width: "34%" }}>Description of Goods</th><th>Unit Price<br />Incl(All tax)</th><th>Qty</th><th>IGST %</th><th>IGST Amt</th><th className="r">Total Amt</th></tr>
            <tr><td className="b">{product}</td><td>{unitIncl.toFixed(2)}</td><td>{qty}</td><td>{GST_PCT.toFixed(2)}%</td><td>{igstAmt.toFixed(2)}</td><td className="r">{total.toFixed(2)}</td></tr>
            <tr><td colSpan={5} className="r b">Total Amount (Rs.)</td><td className="r b">{total.toFixed(2)}</td></tr>
            {partial ? <tr className="inv-partial"><td colSpan={5} className="r">Online Payment Received</td><td className="r">{onlinePaid.toFixed(2)}</td></tr> : null}
            {partial ? <tr className="inv-partial"><td colSpan={5} className="r b">Balance / COD Collectable</td><td className="r b">{balance.toFixed(2)}</td></tr> : null}
          </tbody>
        </table>

        <table><tbody>
          <tr><td><span className="b">Amount in Words:</span> {wordsIndian(total)}</td></tr>
        </tbody></table>

        <table className="foot"><tbody>
          <tr><td>As the main distributor situated in JAIPUR, RAJASTHAN, hence subject to JAIPUR Jurisdiction.</td></tr>
          <tr><td>*Do not pay any extra charges to courier.</td></tr>
          <tr><td>THIS IS COMPUTER GENERATED INVOICE HENCE REQUIRES NO SIGNATURE.</td></tr>
        </tbody></table>
      </div>
    </>
  );
}
