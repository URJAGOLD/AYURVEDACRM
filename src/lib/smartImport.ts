import ExcelJS from "exceljs";

export const IMPORT_FIELDS = [
  "CustomerName","ContactNumber","ProductName","Quantity","Price","Address","City","State","District","Pincode","Source","PaymentStatus","Remark",
] as const;
export type ImportField = typeof IMPORT_FIELDS[number];

const SYN: Record<ImportField, string[]> = {
  CustomerName: ["customername","name","customer","custname","fullname","clientname","client","partyname","party","buyer","ग्राहक","नाम","ग्राहकनाम"],
  ContactNumber: ["contactnumber","mobile","mobileno","mobilenumber","phone","phoneno","phonenumber","contact","contactno","whatsapp","whatsappno","whatsappnumber","cell","mob","number","no","ph","मोबाइल","फोन","फ़ोन","नंबर","नम्बर","संपर्क","मोबाइलनंबर"],
  ProductName: ["productname","product","item","itemname","sku","प्रोडक्ट","उत्पाद","सामान","वस्तु"],
  Quantity: ["quantity","qty","quantities","मात्रा","संख्या"],
  Price: ["price","amount","amt","rate","mrp","cost","total","value","कीमत","दाम","राशि","मूल्य","रकम"],
  Address: ["address","addr","fulladdress","completeaddress","पता","एड्रेस"],
  City: ["city","town","सिटी","शहर","नगर"],
  State: ["state","province","राज्य","प्रदेश"],
  District: ["district","dist","जिला","ज़िला"],
  Pincode: ["pincode","pin","zip","zipcode","postalcode","postcode","पिन","पिनकोड"],
  Source: ["source","src","leadsource","channel","campaign","स्रोत","सोर्स","माध्यम"],
  PaymentStatus: ["paymentstatus","payment","paystatus","paymentmode","भुगतान","पेमेंट"],
  Remark: ["remark","remarks","note","notes","comment","comments","description","टिप्पणी","नोट","विवरण"],
};

export function normHeader(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]/g, "");
}
export function cellText(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v) return String((v as any).text ?? "");
    if ("result" in v) return String((v as any).result ?? "");
    if (Array.isArray((v as any).richText)) return (v as any).richText.map((r: any) => r.text).join("");
    return String(v);
  }
  return String(v);
}
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
export function normalizePhone(s: string): string {
  let d = digits(s);
  // +91 country code in various lengths
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);        // 91 + 10
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);  // 091 + 10
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);    // 0 + 10
  return d;
}
function colIsMostly(rows: string[][], col: number, test: (s: string) => boolean): boolean {
  let tot = 0, hit = 0;
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (!v) continue;
    tot++; if (test(v)) hit++;
    if (tot >= 30) break;
  }
  return tot > 0 && hit / tot >= 0.6;
}
export function autoMap(headers: string[], rows: string[][]): Record<ImportField, number | null> {
  const map: Record<string, number | null> = {};
  const used = new Set<number>();
  const nh = headers.map(normHeader);
  for (const field of IMPORT_FIELDS) {
    const syns = SYN[field];
    let found = -1;
    for (let i = 0; i < nh.length; i++) { if (used.has(i)) continue; if (syns.includes(nh[i])) { found = i; break; } }
    if (found < 0) for (let i = 0; i < nh.length; i++) { if (used.has(i)) continue; const h = nh[i]; if (h && syns.some((s) => h.includes(s) || s.includes(h))) { found = i; break; } }
    map[field] = found >= 0 ? found : null;
    if (found >= 0) used.add(found);
  }
  const isPhone = (s: string) => normalizePhone(s).length === 10;
  const isPin = (s: string) => digits(s).length === 6;
  if (map.ContactNumber != null && !colIsMostly(rows, map.ContactNumber, isPhone)) { used.delete(map.ContactNumber); map.ContactNumber = null; }
  if (map.ContactNumber == null) for (let i = 0; i < headers.length; i++) { if (used.has(i)) continue; if (colIsMostly(rows, i, isPhone)) { map.ContactNumber = i; used.add(i); break; } }
  if (map.Pincode == null) for (let i = 0; i < headers.length; i++) { if (used.has(i)) continue; if (colIsMostly(rows, i, isPin)) { map.Pincode = i; used.add(i); break; } }
  return map as Record<ImportField, number | null>;
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}
export async function readToMatrix(buf: Buffer, filename: string): Promise<string[][]> {
  if (/\.csv$/i.test(filename)) {
    const text = buf.toString("utf-8").replace(/^\uFEFF/, "");
    return parseCsv(text).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const maxCol = ws.columnCount || 1;
  const out: string[][] = [];
  ws.eachRow((row) => {
    const arr: string[] = [];
    for (let c = 1; c <= maxCol; c++) arr.push(cellText(row.getCell(c).value).trim());
    if (arr.some((v) => v !== "")) out.push(arr);
  });
  return out;
}