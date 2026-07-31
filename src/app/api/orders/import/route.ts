import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { parseImportWorkbook, buildOrderCode } from "@/lib/excel";

export const runtime = "nodejs";

// POST multipart/form-data field "file" (.xlsx). Columns: CustomerName, ContactNumber,
// ProductName, Quantity, Price, Address, City, State, District, Pincode, Source, PaymentStatus, Remark
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.import");
  if (g instanceof Response) return g;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return bad("No file uploaded (field name: file)");
  const parsed = await parseImportWorkbook(Buffer.from(await file.arrayBuffer()));
  if (parsed.length === 0) return bad("Sheet is empty");

  const states = await prisma.state.findMany({ select: { id:true, name:true } });
  const stateByName = new Map(states.map(s => [s.name.toLowerCase(), s.id]));
  let baseSeq = 349317 + (await prisma.order.count());
  const created: string[] = [];
  const rowErrors: { row: number; errors: string[] }[] = [];

  for (const r of parsed) {
    if (r.errors.length) { rowErrors.push({ row: r.rowNumber, errors: r.errors }); continue; }
    const d = r.data;
    const stateId = d.State ? stateByName.get(String(d.State).toLowerCase()) ?? null : null;
    try {
      baseSeq += 1;
      const code = buildOrderCode(baseSeq);
      await prisma.order.create({ data: {
        orderCode: code, customerName: String(d.CustomerName), contactNumber: String(d.ContactNumber),
        productName: String(d.ProductName), quantity: Number(d.Quantity) || 1, price: Number(d.Price) || 0,
        address: String(d.Address ?? ""), city: String(d.City ?? ""), stateId, pincode: String(d.Pincode ?? "111111"),
        source: String(d.Source ?? "Calling"), paymentStatus: String(d.PaymentStatus ?? "Pending"),
        remark: d.Remark ? String(d.Remark) : null, orderStatus: "New",
      }});
      created.push(code);
    } catch (e: any) { rowErrors.push({ row: r.rowNumber, errors: [e.message] }); }
  }
  await audit(g.user.id, "order.import", "order", undefined, { created: created.length, failed: rowErrors.length });
  return ok({ createdCount: created.length, created, failedCount: rowErrors.length, rowErrors });
}