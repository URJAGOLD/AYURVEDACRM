import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// Canonical Shiprocket lifecycle (matches mapSrStatus stage outputs). Always shown so
// the filter is useful from day one; DB distinct trackingStage values are merged in so
// any NEW/unknown statuses appear automatically without code changes (dynamic).
const CANON = ["Booked", "Ready To Ship", "AWB Assigned", "Pickup Scheduled", "In Transit", "Out For Delivery", "Delivered", "NDR", "RTO Initiated", "RTO Delivered", "Lost", "Damaged", "Returned", "Cancelled"];

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const rows = await prisma.order.findMany({
    where: { isDeleted: false, trackingStage: { not: null } },
    select: { trackingStage: true },
    distinct: ["trackingStage"],
  });
  const fromDb = rows.map((r) => r.trackingStage as string).filter(Boolean);
  const extras = fromDb.filter((s) => !CANON.includes(s)).sort();
  return ok({ statuses: [...CANON, ...extras] });
}