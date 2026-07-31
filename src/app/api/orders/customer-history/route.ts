import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

// Repeat-customer history for a phone number. Used by the order form to warn
// about duplicates and show the customer's previous orders. Respects scoping:
// without orders.viewAll a user only sees their own leads.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { user } = g;
  const sp = req.nextUrl.searchParams;
  const phone = String(sp.get("phone") || "").replace(/\D/g, "").slice(-10);
  const exclude = Number(sp.get("exclude") || 0);
  if (phone.length < 10) return ok({ phone, count: 0, orders: [], summary: {} });
  const where: any = { contactNumber: phone, isDeleted: false };
  if (!can(user, "orders.viewAll")) where.leadOwnerId = user.id;
  if (exclude) where.id = { not: exclude };
  const orders = await prisma.order.findMany({
    where, orderBy: { dateTime: "desc" }, take: 20,
    select: {
      id: true, orderCode: true, dateTime: true, productName: true, orderStatus: true,
      paymentStatus: true, price: true, totalAmount: true, onlinePaid: true, followUpDate: true,
      source: true, leadOwner: { select: { name: true } },
    },
  });
  const count = orders.length;
  const totalPaid = orders.reduce((s, o) => s + (Number(o.onlinePaid) || 0), 0);
  return ok({
    phone, count, orders,
    summary: {
      lastOrderDate: count ? orders[0].dateTime : null,
      lastProduct: count ? orders[0].productName : null,
      lastFollowUp: orders.find((o) => o.followUpDate)?.followUpDate || null,
      leadOwnerName: orders.find((o) => o.leadOwner?.name)?.leadOwner?.name || null,
      totalOnlinePaid: totalPaid,
    },
  });
}