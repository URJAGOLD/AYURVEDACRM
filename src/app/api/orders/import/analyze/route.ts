import { NextRequest } from "next/server";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { readToMatrix, autoMap, IMPORT_FIELDS } from "@/lib/smartImport";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.import");
  if (g instanceof Response) return g;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return bad("No file uploaded (field name: file)");
  const matrix = await readToMatrix(Buffer.from(await file.arrayBuffer()), file.name);
  if (matrix.length < 2) return bad("File me header + data rows nahi mile");
  const headers = matrix[0];
  const rows = matrix.slice(1);
  if (rows.length > 20000) return bad("Bahut zyada rows (" + rows.length + "). File ko 20000 rows se chhota karke upload karein.");
  const mapping = autoMap(headers, rows);
  const columns = headers.map((h, i) => ({ index: i, header: h || ("Column " + (i + 1)), samples: rows.slice(0, 5).map((r) => r[i] ?? "") }));
  return ok({ headers, columns, rows, mapping, fields: IMPORT_FIELDS, rowCount: rows.length });
}