import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { bookOrderOnShiprocket, generateAWB, generateLabel, requestPickup, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

// POST { action: "book"|"label"|"pickup", orderIds: number[] }
// Batch Shiprocket dispatch. Returns per-order results (success + errors).
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.book");
  if (g instanceof Response) return g;
  const { action, orderIds } = await req.json().catch(() => ({}));
  if (!action || !Array.isArray(orderIds) || orderIds.length === 0) return bad("action + orderIds[] required");
  if (!["book", "label", "pickup"].includes(action)) return bad("action must be book|label|pickup");

  const ids = orderIds.map(Number).slice(0, 20); // max 20 at once

  const orders = await prisma.order.findMany({
    where: { id: { in: ids }, isDeleted: false },
    include: { state: { select: { name: true } } },
  });

  const results: { orderId: number; orderCode: string; ok: boolean; msg: string; data?: any }[] = [];

  for (const order of orders) {
    const oc = order.orderCode;
    try {
      if (action === "book") {
        if (order.awbCode) { results.push({ orderId: order.id, orderCode: oc, ok: false, msg: "Already booked (AWB " + order.awbCode + ")" }); continue; }
        const missing: string[] = [];
        if (!order.customerName?.trim()) missing.push("Customer Name");
        if (!order.contactNumber?.trim()) missing.push("Phone");
        if (!order.pincode?.trim()) missing.push("Pincode");
        if (!order.city?.trim()) missing.push("City");
        if (!order.state?.name) missing.push("State");
        if (missing.length) { results.push({ orderId: order.id, orderCode: oc, ok: false, msg: "Missing: " + missing.join(", ") }); continue; }
        const sr = await bookOrderOnShiprocket({
          orderCode: order.orderCode, dateTime: order.dateTime, customerName: order.customerName,
          contactNumber: order.contactNumber, email: order.email, address: order.address, city: order.city,
          pincode: order.pincode, stateName: order.state.name, productName: order.productName,
          productSku: order.productSku, quantity: order.quantity, price: Number(order.price), paymentStatus: order.paymentStatus,
        });
        if (!sr.shipmentId) { results.push({ orderId: order.id, orderCode: oc, ok: false, msg: "Shiprocket: no shipmentId" }); continue; }
        let awb = { awbCode: null as string | null, courierName: null as string | null };
        try { awb = await generateAWB(sr.shipmentId); } catch {}
        await prisma.order.update({ where: { id: order.id }, data: {
          shiprocketOrderId: sr.shiprocketOrderId, shipmentId: sr.shipmentId,
          awbCode: awb.awbCode, courierName: awb.courierName,
          shippingStatus: awb.awbCode ? "Ready To Ship" : "NEW",
          trackingStage: awb.awbCode ? "Ready To Ship" : null,
          orderStatus: awb.awbCode ? "GPO Done" : order.orderStatus,
          bookedAt: new Date(),
        }});
        await prisma.orderHistory.create({ data: { orderId: order.id, status: awb.awbCode ? "GPO Done" : "Shiprocket Booked", remark: "Bulk book", addedById: g.user.id } });
        await audit(g.user.id, "shiprocket.bulkBook", "order", order.id, { awb: awb.awbCode });
        results.push({ orderId: order.id, orderCode: oc, ok: true, msg: awb.awbCode ? "Booked - AWB " + awb.awbCode : "Booked (no AWB)", data: { awb: awb.awbCode, courier: awb.courierName } });

      } else if (action === "label") {
        if (!order.shipmentId) { results.push({ orderId: order.id, orderCode: oc, ok: false, msg: "Not booked yet" }); continue; }
        const url = await generateLabel(order.shipmentId);
        if (url) await prisma.order.update({ where: { id: order.id }, data: { labelUrl: url } });
        results.push({ orderId: order.id, orderCode: oc, ok: !!url, msg: url ? "Label ready" : "No label URL", data: { labelUrl: url } });

      } else if (action === "pickup") {
        if (!order.shipmentId) { results.push({ orderId: order.id, orderCode: oc, ok: false, msg: "Not booked yet" }); continue; }
        await requestPickup(order.shipmentId);
        await prisma.order.update({ where: { id: order.id }, data: { shippingStatus: "PICKUP SCHEDULED", trackingStage: "Pickup Scheduled" } });
        await audit(g.user.id, "shiprocket.bulkPickup", "order", order.id);
        results.push({ orderId: order.id, orderCode: oc, ok: true, msg: "Pickup requested" });
      }
    } catch (e: any) {
      results.push({ orderId: order.id, orderCode: oc, ok: false, msg: shiprocketError(e) });
    }
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return ok({ action, total: results.length, success, failed, results });
}