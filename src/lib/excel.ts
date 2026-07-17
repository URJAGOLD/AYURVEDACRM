import ExcelJS from "exceljs";

export const EXPORT_COLUMNS = [
  "OrderId","Date","Customer","Contact","Product","Qty","Price","Address","City","State","District",
  "Pincode","Status","Payment","Source","LeadOwner","Dealer","FollowUp","AWB","Courier","ShippingStatus",
  "Total","OnlinePaid","Balance","PaymentMode","AltMobile","AgentAssignDate","DealerAssignDate","ZM","Remark","SourceTags","LastStatusChange",
] as const;

export async function buildExportWorkbook(rows: Record<string, any>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders");
  ws.columns = EXPORT_COLUMNS.map(c => ({ header: c, key: c, width: 18 }));
  ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const IMPORT_COLUMNS = [
  "CustomerName","ContactNumber","ProductName","Quantity","Price","Address","City","State","District","Pincode","Source","PaymentStatus","Remark",
] as const;

export interface ParsedImportRow { rowNumber: number; data: Record<string, any>; errors: string[]; }

export async function parseImportWorkbook(buffer: Buffer): Promise<ParsedImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const header: Record<number, string> = {};
  ws.getRow(1).eachCell((cell, col) => { header[col] = String(cell.value ?? "").trim(); });
  const out: ParsedImportRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const data: Record<string, any> = {};
    row.eachCell((cell, col) => {
      const key = header[col];
      if (key) data[key] = (typeof cell.value === "object" && cell.value && "text" in (cell.value as any)) ? (cell.value as any).text : cell.value;
    });
    if (Object.values(data).every(v => v === null || v === undefined || v === "")) return;
    const errors: string[] = [];
    const phone = String(data.ContactNumber ?? "").replace(/\D/g, "");
    if (!data.CustomerName) errors.push("CustomerName required");
    if (!/^\d{10}$/.test(phone)) errors.push("ContactNumber must be 10 digits");
    const pin = String(data.Pincode ?? "").replace(/\D/g, "");
    if (pin && !/^\d{6}$/.test(pin)) errors.push("Pincode must be 6 digits");
    if (!data.ProductName) errors.push("ProductName required");
    out.push({ rowNumber, data: { ...data, ContactNumber: phone, Pincode: pin || "111111" }, errors });
  });
  return out;
}

export function buildOrderCode(seq: number): string {
  const prefix = process.env.ORDER_CODE_PREFIX || "AACRM";
  return prefix + String(seq).padStart(6, "0");
}