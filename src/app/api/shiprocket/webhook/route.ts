import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapSrStatus } from "@/lib/shiprocket";
import { logStatusActivity } from "@/lib/statusActivity";

export const runtime = "nodejs";

// ─── helpers ────────────────────────────────────────────────────────────────
const s = (v: any) => (v == null ? "" : String(v).trim());

function extractPhone(raw: any): string {
  return s(raw?.billing_phone || raw?.phone || raw?.contact_phone || raw?.customer_phone || "")
    .replace(/\D/g, "").slice(-10);
}

function detectEvent(body: any): string {
  const evt = s(body?.event || body?.event_name || body?.type || body?.webhook_type || "").toUpperCase();
  const awb = body?.awb || body?.awb_code;
  const srOrderId = body?.order_id || body?.shiprocket_order_id;
  if (evt.includes("CREATE") && (srOrderId || body?.customer_name)) return "ORDER_CREATED";
  if (evt.includes("AWB") || evt.includes("ASSIGN")) return "AWB_ASSIGNED";
  if (evt.includes("CANCEL")) return "CANCELLED";
  if (evt.includes("PICKUP")) return "PICKUP";
  if (evt.includes("NDR")) return "NDR";
  if (evt.includes("RTO")) return "RTO";
  if (awb && (body?.current_status || body?.shipment_status || body?.status)) return "STATUS_UPDATE";
  if (srOrderId && body?.customer_name) return "ORDER_CREATED";
  if (awb) return "STATUS_UPDATE";
  return "UNKNOWN";
}

async function logWebhook(event: string, body: any, awb?: string, orderId?: number, srOrderId?: string, action?: string, note?: string) {
  await prisma.webhookLog.create({
    data: {
      source: "shiprocket", event, awb: awb || null, orderId: orderId || null,
      srOrderId: srOrderId || null,       payload: JSON.stringify(body),
      action: action || "received", note: note || null,
    },
  }).catch(() => {});
}

async function getNextOrderCode(): Promise<string> {
  const last = await prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const seq = 349317 + (last?.id ?? 0) + 1;
  const prefix = process.env.ORDER_CODE_PREFIX || "AACRM";
  return prefix + String(seq);
}

// ─── main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth check
  const token = req.headers.get("x-api-key") || req.headers.get("x-webhook-token");
  if (process.env.SHIPROCKET_WEBHOOK_TOKEN && token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) {
    // Return 401 so Shiprocket knows to retry - do NOT return 200/ignored
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body (keep raw for log)
  const body = await req.json().catch(() => ({}));

  // 3. Detect event type
  const event = detectEvent(body);

  // Common fields
  const awb = s(body?.awb || body?.awb_code) || undefined;
  const srOrderId = s(body?.order_id || body?.shiprocket_order_id || body?.sr_order_id) || undefined;
  const currentStatus = s(body?.current_status || body?.shipment_status || body?.status) || undefined;

  // ─── CASE 1: STATUS UPDATE (tracking update on existing CRM order) ──────
  if (event === "STATUS_UPDATE" && awb) {
    const order = await prisma.order.findFirst({ where: { awbCode: awb } });
    if (!order) {
      await logWebhook(event, body, awb, undefined, srOrderId, "ignored", "AWB not found in CRM");
      return NextResponse.json({ received: true, action: "ignored", reason: "awb_not_found" });
    }
    const mapped = mapSrStatus(currentStatus || "");
    const data: any = { shippingStatus: currentStatus };
    if (mapped.stage) { data.trackingStage = mapped.stage; data.lastTrackedAt = new Date(); }
    if (mapped.crmStatus) data.orderStatus = mapped.crmStatus;
    await prisma.order.update({ where: { id: order.id }, data });
    await prisma.orderHistory.create({ data: { orderId: order.id, status: "Webhook: " + (mapped.stage || currentStatus) + (mapped.crmStatus ? " -> " + mapped.crmStatus : "") } });
    if (mapped.crmStatus) await logStatusActivity({ orderId: order.id, previousStatus: order.orderStatus, newStatus: mapped.crmStatus, source: "webhook", changedById: null, leadOwnerId: order.leadOwnerId, dealerId: order.dealerId });
    await logWebhook(event, body, awb, order.id, srOrderId, "updated", "status -> " + (mapped.crmStatus || currentStatus));
    return NextResponse.json({ received: true, action: "status_updated", orderId: order.id });
  }

  // ─── CASE 2: AWB_ASSIGNED (update awb on existing order) ────────────────
  if (event === "AWB_ASSIGNED" && srOrderId && awb) {
    const order = await prisma.order.findFirst({ where: { shiprocketOrderId: srOrderId } });
    if (order) {
      await prisma.order.update({ where: { id: order.id }, data: { awbCode: awb, courierName: s(body?.courier_name) || order.courierName, orderStatus: "GPO Done", trackingStage: "AWB Assigned", lastTrackedAt: new Date() } });
      await prisma.orderHistory.create({ data: { orderId: order.id, status: "Webhook: AWB Assigned - " + awb } });
      await logStatusActivity({ orderId: order.id, previousStatus: order.orderStatus, newStatus: "GPO Done", source: "webhook", changedById: null, leadOwnerId: order.leadOwnerId, dealerId: order.dealerId });
      await logWebhook(event, body, awb, order.id, srOrderId, "updated", "awb assigned");
      return NextResponse.json({ received: true, action: "awb_updated", orderId: order.id });
    }
  }

  // ─── CASE 3: ORDER_CREATED (new order from Shiprocket Panel) ────────────
  if (event === "ORDER_CREATED" && srOrderId) {
    // Dedup: already in CRM?
    const existing = await prisma.order.findFirst({ where: { OR: [{ shiprocketOrderId: srOrderId }, ...(awb ? [{ awbCode: awb }] : []) ] } });
    if (existing) {
      await logWebhook(event, body, awb, existing.id, srOrderId, "ignored", "already exists: id " + existing.id);
      return NextResponse.json({ received: true, action: "duplicate_ignored", orderId: existing.id });
    }

    // Extract customer data from Shiprocket payload
    const phone = extractPhone(body);
    if (!phone) {
      await logWebhook(event, body, awb, undefined, srOrderId, "error", "no phone in payload");
      return NextResponse.json({ received: true, action: "error", reason: "no_phone" });
    }

    // State lookup
    const stateName = s(body?.billing_state || body?.state || "");
    let stateId: number | null = null;
    if (stateName) {
      const st = await prisma.state.findFirst({ where: { name: { equals: stateName, mode: "insensitive" } }, select: { id: true } });
      stateId = st?.id ?? null;
    }

    const productName = s(body?.order_items?.[0]?.name || body?.product_name || body?.items?.[0]?.name || "Sutra Gold+");
    const price = Number(body?.sub_total || body?.order_items?.[0]?.selling_price || body?.order_items?.[0]?.price || 0) || 999;
    const qty = Number(body?.order_items?.[0]?.units || body?.quantity || 1) || 1;
    const payMethod = s(body?.payment_method || "").toUpperCase();
    const payStatus = payMethod === "PREPAID" ? "Completed" : "Pending";
    const orderCode = await getNextOrderCode();

    const created = await prisma.order.create({
      data: {
        orderCode, customerName: s(body?.billing_customer_name || body?.customer_name || "Unknown"),
        contactNumber: phone, email: s(body?.billing_email || body?.email) || null,
        address: s(body?.billing_address || body?.address || ""),
        city: s(body?.billing_city || body?.city || ""), stateId, pincode: s(body?.billing_pincode || body?.pincode || "111111"),
        productName, quantity: qty, price, paymentMode: payMethod || "COD", paymentStatus: payStatus,
        source: "Shiprocket Panel",
        orderStatus: awb ? "GPO Done" : "GPO Done",
        shiprocketOrderId: srOrderId, shipmentId: s(body?.shipment_id) || null,
        awbCode: awb || null, courierName: s(body?.courier_name) || null,
        trackingStage: awb ? "AWB Assigned" : null, bookedAt: new Date(),
        remark: "Auto-created from Shiprocket webhook (ORDER_CREATED)",
      },
    });
    await prisma.orderHistory.create({ data: { orderId: created.id, status: "Webhook: ORDER_CREATED from Shiprocket Panel", remark: "SR order_id: " + srOrderId } });
    await logWebhook(event, body, awb, created.id, srOrderId, "created", "new order id " + created.id);
    return NextResponse.json({ received: true, action: "order_created", orderId: created.id, orderCode });
  }

  // ─── CASE 4: CANCELLED ──────────────────────────────────────────────────
  if (event === "CANCELLED" && (srOrderId || awb)) {
    const order = await prisma.order.findFirst({ where: { OR: [
      ...(srOrderId ? [{ shiprocketOrderId: srOrderId }] : []),
      ...(awb ? [{ awbCode: awb }] : []),
    ]}});
    if (order && !["Cancelled", "Final cancel"].includes(order.orderStatus)) {
      await prisma.order.update({ where: { id: order.id }, data: { orderStatus: "Cancelled", trackingStage: "Cancelled", lastTrackedAt: new Date() } });
      await prisma.orderHistory.create({ data: { orderId: order.id, status: "Webhook: Shiprocket Cancelled", remark: s(body?.reason) || null } });
      await logStatusActivity({ orderId: order.id, previousStatus: order.orderStatus, newStatus: "Cancelled", source: "webhook", changedById: null, leadOwnerId: order.leadOwnerId, dealerId: order.dealerId });
      await logWebhook(event, body, awb, order.id, srOrderId, "updated", "cancelled");
      return NextResponse.json({ received: true, action: "cancelled", orderId: order.id });
    }
  }

  // ─── CASE 5: RTO / NDR / PICKUP — log + update stage ───────────────────
  if ((event === "RTO" || event === "NDR" || event === "PICKUP") && awb) {
    const order = await prisma.order.findFirst({ where: { awbCode: awb } });
    if (order) {
      const stageMap: Record<string, any> = {
        RTO: { trackingStage: "RTO Initiated", orderStatus: "RTO", rtoStatus: "RTO" },
        NDR: { trackingStage: "NDR", ndrStatus: "NDR" },
        PICKUP: { trackingStage: "Pickup Scheduled" },
      };
      await prisma.order.update({ where: { id: order.id }, data: { ...stageMap[event], lastTrackedAt: new Date() } });
      await prisma.orderHistory.create({ data: { orderId: order.id, status: "Webhook: " + event + (awb ? " / " + awb : "") } });
      if (event === "RTO") await logStatusActivity({ orderId: order.id, previousStatus: order.orderStatus, newStatus: "RTO", source: "webhook", changedById: null, leadOwnerId: order.leadOwnerId, dealerId: order.dealerId });
      await logWebhook(event, body, awb, order.id, srOrderId, "updated", event + " stage set");
      return NextResponse.json({ received: true, action: "stage_updated", event, orderId: order.id });
    }
  }

  // ─── UNKNOWN / unhandled: log and return ok ──────────────────────────────
  await logWebhook(event, body, awb, undefined, srOrderId, "ignored", "unhandled event");
  return NextResponse.json({ received: true, action: "logged", event });
}

// GET — health check (confirm webhook URL is reachable)
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-api-key");
  const ok = !process.env.SHIPROCKET_WEBHOOK_TOKEN || token === process.env.SHIPROCKET_WEBHOOK_TOKEN;
  return NextResponse.json({ status: ok ? "ok" : "unauthorized", endpoint: "prakritiherbs.in/crm/api/shiprocket/webhook", ts: new Date().toISOString() }, { status: ok ? 200 : 401 });
}