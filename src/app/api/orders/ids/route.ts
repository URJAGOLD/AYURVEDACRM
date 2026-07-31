import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

// Returns ALL order ids matching the current filters (no pagination),
// powering the "Select all N matching" action in the orders list.
// Mirrors the where-logic of GET /api/orders, including data scoping.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const sp = req.nextUrl.searchParams;
  const where: any = { isDeleted: false };
  if (!can(user, "orders.viewAll")) where.leadOwnerId = user.id;

  const eq = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = v; };
  const num = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = Number(v); };
  const contains = (k: string, f: string) => { const v = sp.get(k); if (v) where[f] = { contains: v, mode: "insensitive" }; };
  eq("status","orderStatus"); eq("payment","paymentStatus"); eq("pincode","pincode"); eq("product","productName");
  num("stateId","stateId"); num("districtId","districtId"); num("dealerId","dealerId"); num("zm","zmId");
  const and: any[] = [];
  { const v = sp.get("phone"); if (v) and.push({ OR: [{ contactNumber: { contains: v } }, { altMobile: { contains: v } }] }); }
  { const v = sp.get("source"); if (v) and.push({ OR: [{ source: v }, { sourceTags: { contains: '"' + v + '"' } }] }); }
  if (and.length) where.AND = and;
  contains("orderId","orderCode"); contains("city","city"); contains("customer","customerName");
  if (can(user, "orders.viewAll")) {
    const lo = sp.get("leadOwner");
    if (lo === "0") where.leadOwnerId = null; else if (lo) where.leadOwnerId = Number(lo);
  }
  const range = (fromK: string, toK: string, f: string) => {
    const from = sp.get(fromK), to = sp.get(toK);
    if (from || to) where[f] = { ...(from ? { gte: new Date(from + "T00:00:00.000+05:30") } : {}), ...(to ? { lte: new Date(to + "T23:59:59.999+05:30") } : {}) };
  };
  range("orderFrom","orderTo","dateTime"); range("followFrom","followTo","followUpDate"); range("assignFrom","assignTo","agentAssignDate");

  const rows = await prisma.order.findMany({ where, select: { id: true }, orderBy: { id: "desc" } });
  return ok({ ids: rows.map((r) => r.id), total: rows.length });
}