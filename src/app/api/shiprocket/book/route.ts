import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { bookOrderOnShiprocket, generateAWB, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";

// POST { orderId, courierId? } -> book on Shiprocket + AWB + store
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.book");
  if (g instanceof Response) return g;
  const { orderId, courierId } = await req.json().catch(() => ({}));
  if (!orderId) return bad("orderId required");
  const order = await prisma.order.findFirst({
    where: { id: Number(orderId), isDeleted: false },
    include: { state: { select: { name: true } } },
  });
  if (!order) return bad("Order not found", 404);
  if (order.awbCode) return bad("Already booked (AWB " + order.awbCode + ")", 409);

  // Pre-booking validation (catch missing fields BEFORE hitting Shiprocket)
  const missing: string[] = [];
  if (!order.customerName?.trim()) missing.push("Customer Name");
  if (!order.contactNumber?.trim()) missing.push("Phone");
  if (!order.pincode?.trim()) missing.push("Pincode");
  if (!order.city?.trim()) missing.push("City");
  if (!order.state?.name) missing.push("State");
  if (missing.length) {
    await audit(g.user.id, "shiprocket.book", "order", order.id, { error: "Validation failed: " + missing.join(", "), courierId: courierId ?? null });
    return bad("Booking failed - required fields missing: " + missing.join(", ") + ". Please edit the order and fill in these details first.", 422);
  }

  try {
    const sr = await bookOrderOnShiprocket({
      orderCode: order.orderCode, dateTime: order.dateTime, customerName: order.customerName,
      contactNumber: order.contactNumber, email: order.email, address: order.address, city: order.city,
      pincode: order.pincode, stateName: order.state.name, productName: order.productName,
      productSku: order.productSku, quantity: order.quantity, price: Number(order.price), paymentStatus: order.paymentStatus,
    });

    // Validate Shiprocket created the order (silent errors return empty ids)
    if (!sr.shiprocketOrderId || !sr.shipmentId) {
      const rawMsg = sr.raw ? JSON.stringify(sr.raw).slice(0, 200) : "empty response";
      await audit(g.user.id, "shiprocket.book", "order", order.id, { ok: false, http: 502, error: "Shiprocket order creation failed (no shipment_id): " + rawMsg, courierId: courierId ?? null, request: sr.payload, response: sr.raw });
      return bad("Shiprocket order creation failed - no shipment ID returned. Raw: " + rawMsg, 502);
    }

    let awb: { awbCode: string | null; courierName: string | null } = { awbCode: null, courierName: null };
    let awbWarning = "";
    if (sr.shipmentId) {
      try { awb = await generateAWB(sr.shipmentId, courierId ? Number(courierId) : undefined); }
      catch (e) {
        awbWarning = "AWB assignment failed: " + shiprocketError(e);
        await prisma.order.update({ where: { id: order.id }, data: { shiprocketOrderId: sr.shiprocketOrderId, shipmentId: sr.shipmentId, shippingStatus: "NEW", bookedAt: new Date() } });
        await audit(g.user.id, "shiprocket.book", "order", order.id, { ok: true, warning: awbWarning, shipmentId: sr.shipmentId, courierId: courierId ?? null, request: sr.payload, response: sr.raw });
        return ok({ success: true, warning: awbWarning, shipmentId: sr.shipmentId });
      }
    }

    // If AWB null (no throw, but null returned) surface as warning
    if (!awb.awbCode) awbWarning = "Order created on Shiprocket but AWB not assigned (courier may have rejected). Check Shiprocket panel.";

    await prisma.order.update({ where: { id: order.id }, data: {
      shiprocketOrderId: sr.shiprocketOrderId, shipmentId: sr.shipmentId,
      awbCode: awb.awbCode, courierName: awb.courierName,
      shippingStatus: awb.awbCode ? "Ready To Ship" : "NEW",
      trackingStage: awb.awbCode ? "Ready To Ship" : null,
      orderStatus: awb.awbCode ? "GPO Done" : order.orderStatus, // booked == courier mein lag gaya == GPO Done
      bookedAt: new Date(),
    }});
    await prisma.orderHistory.create({ data: { orderId: order.id, status: awb.awbCode ? "Shiprocket Booked" : "Shiprocket Order Created (AWB pending)", remark: awb.awbCode ? "AWB: " + awb.awbCode : awbWarning, addedById: g.user.id } });
    await audit(g.user.id, "shiprocket.book", "order", order.id, { ok: true, http: 200, awb: awb.awbCode, courier: awb.courierName, shipmentId: sr.shipmentId, shiprocketOrderId: sr.shiprocketOrderId, courierId: courierId ?? null, warning: awbWarning || undefined, request: sr.payload, response: sr.raw, awbResponse: awb.raw });
    return ok({ success: true, awb: awb.awbCode, courier: awb.courierName, shipmentId: sr.shipmentId, warning: awbWarning || undefined });
  } catch (err) {
    const msg = shiprocketError(err);
    await audit(g.user.id, "shiprocket.book", "order", order.id, { error: "Booking exception: " + msg, courierId: courierId ?? null });
    return bad("Shiprocket booking failed: " + msg, 502);
  }
}