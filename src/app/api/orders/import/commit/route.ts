import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { buildOrderCode } from "@/lib/excel";
import { normalizePhone, type ImportField } from "@/lib/smartImport";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.import");
  if (g instanceof Response) return g;
  const body = await req.json().catch(() => ({}));
  const rows: string[][] = Array.isArray(body.rows) ? body.rows : [];
  const mapping: Record<string, number | null> = body.mapping || {};
  const defaultSource = String(body.defaultSource || "Bulk Import");
  const defaultProduct = String(body.defaultProduct || "Sutra Gold+");
  if (rows.length === 0) return bad("Import ke liye koi row nahi");
  if (mapping.CustomerName == null && mapping.ContactNumber == null) return bad("Kam se kam Name aur Mobile map karein");

  const get = (r: string[], f: ImportField) => { const i = mapping[f]; return i == null || i < 0 ? "" : String(r[i] ?? "").trim(); };
  const states = await prisma.state.findMany({ select: { id: true, name: true } });
  const stateByName = new Map(states.map((s) => [s.name.toLowerCase(), s.id]));
  let baseSeq = 349317 + (await prisma.order.count());
  let createdCount = 0;
  const rowErrors: { row: number; errors: string[] }[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const name = get(r, "CustomerName");
    const phone = normalizePhone(get(r, "ContactNumber"));
    const errs: string[] = [];
    if (!name) errs.push("Name missing");
    if (phone.length !== 10) errs.push("Mobile not 10 digits");
    if (errs.length) { rowErrors.push({ row: idx + 2, errors: errs }); continue; }
    const pinRaw = get(r, "Pincode").replace(/\D/g, "");
    const pincode = /^\d{6}$/.test(pinRaw) ? pinRaw : "111111";
    const stName = get(r, "State");
    const stateId = stName ? stateByName.get(stName.toLowerCase()) ?? null : null;
    const qty = parseInt(get(r, "Quantity"), 10);
    const price = parseFloat(get(r, "Price").replace(/[^0-9.]/g, ""));
    try {
      baseSeq += 1;
      await prisma.order.create({ data: {
        orderCode: buildOrderCode(baseSeq), customerName: name, contactNumber: phone,
        productName: get(r, "ProductName") || defaultProduct,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        price: Number.isFinite(price) ? price : 0,
        address: get(r, "Address"), city: get(r, "City"), stateId, pincode,
        source: get(r, "Source") || defaultSource,
        paymentStatus: get(r, "PaymentStatus") || "Pending",
        remark: get(r, "Remark") || null, orderStatus: "New",
      }});
      createdCount += 1;
    } catch (e: any) { rowErrors.push({ row: idx + 2, errors: [e.message] }); }
  }
  await audit(g.user.id, "order.smartImport", "order", undefined, { created: createdCount, failed: rowErrors.length });
  return ok({ createdCount, failedCount: rowErrors.length, rowErrors: rowErrors.slice(0, 50) });
}