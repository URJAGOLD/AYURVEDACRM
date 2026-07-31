import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { buildOrderCode } from "@/lib/excel";
import { normalizePhone } from "@/lib/smartImport";

export const runtime = "nodejs";
const clean = (v: any) => (v == null ? "" : String(v).trim());

// Verifies the request really came from Shopify using the shared webhook secret.
// Shopify signs the RAW request body - must verify before JSON.parse, and must not
// let Next.js re-serialize the body first (that's why we read req.text() here).
function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Shopify webhook not configured" }, { status: 503 });

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") || "";
  const payload = JSON.parse(rawBody);

  // We only care about new orders here. Shopify sends other topics too if you subscribe to more.
  if (topic && !topic.startsWith("orders/")) {
    return NextResponse.json({ ignored: true });
  }

  const shopifyOrderId = String(payload.id ?? payload.order_number ?? "");
  if (!shopifyOrderId) return NextResponse.json({ error: "No order id in payload" }, { status: 400 });

  const source = "Shopify";
  const externalId = "shopify-" + shopifyOrderId;

  // Idempotency: Shopify retries webhooks on any non-2xx or timeout, so the same
  // order can arrive more than once - dedupe using the same SyncEvent pattern
  // already used by the generic /api/ingest route.
  let already = false;
  try {
    await prisma.syncEvent.create({ data: { source, externalId, mobile: "" } });
  } catch {
    already = true;
  }
  if (already) {
    const existing = await prisma.order.findFirst({ where: { externalRef: externalId } });
    return NextResponse.json({ duplicate: true, orderId: existing?.id });
  }

  const shipping = payload.shipping_address || payload.billing_address || {};
  const customer = payload.customer || {};

  const name = clean(shipping.name) || clean([customer.first_name, customer.last_name].filter(Boolean).join(" ")) || "Unknown";
  const phoneRaw = clean(shipping.phone) || clean(customer.phone) || clean(payload.phone);
  const mobile = normalizePhone(phoneRaw);

  const address = clean([shipping.address1, shipping.address2].filter(Boolean).join(", "));
  const city = clean(shipping.city);
  const pin = clean(shipping.zip).replace(/\D/g, "");
  const provinceName = clean(shipping.province);

  let stateId: number | null = null;
  if (provinceName) {
    const st = await prisma.state.findFirst({ where: { name: { equals: provinceName, mode: "insensitive" } }, select: { id: true } });
    stateId = st?.id ?? null;
  }
  let districtId: number | null = null;
  if (pin) {
    const geo = await prisma.pincode.findUnique({ where: { pincode: pin } }).catch(() => null);
    if (geo) {
      if (!stateId && geo.state) {
        const st = await prisma.state.findFirst({ where: { name: { equals: geo.state, mode: "insensitive" } }, select: { id: true } });
        stateId = st?.id ?? null;
      }
      if (geo.district && stateId) {
        const dt = await prisma.district.findFirst({ where: { name: { equals: geo.district, mode: "insensitive" }, stateId }, select: { id: true } });
        districtId = dt?.id ?? null;
      }
    }
  }

  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const productName = lineItems.map((li: any) => clean(li.title)).filter(Boolean).join(", ") || "Shopify Order";
  const quantity = lineItems.reduce((sum: number, li: any) => sum + (Number(li.quantity) || 0), 0) || 1;

  const totalAmount = parseFloat(payload.total_price || payload.current_total_price || "0") || 0;
  const price = quantity > 0 ? +(totalAmount / quantity).toFixed(2) : totalAmount;

  const financialStatus = clean(payload.financial_status).toLowerCase();
  const paymentStatus = financialStatus === "paid" ? "Completed" : "Pending";

  const last = await prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const order = await prisma.order.create({
    data: {
      orderCode: buildOrderCode(349317 + (last?.id ?? 0) + 1),
      customerName: name,
      contactNumber: mobile.length === 10 ? mobile : (phoneRaw || "0000000000"),
      email: clean(payload.email) || null,
      productName,
      quantity,
      price,
      totalAmount,
      address, city, stateId, districtId,
      pincode: pin || "111111",
      source,
      sourceTags: JSON.stringify([source]),
      externalRef: externalId,
      paymentStatus,
      paymentMode: financialStatus === "paid" ? "Prepaid" : "COD",
      orderStatus: "New",
      remark: `Shopify order #${payload.name || payload.order_number || shopifyOrderId}`,
    },
  });

  await prisma.orderHistory.create({
    data: { orderId: order.id, status: "[Sync] Shopify order received", remark: `Shopify order id ${shopifyOrderId}` },
  });
  await prisma.syncEvent.update({ where: { source_externalId: { source, externalId } }, data: { orderId: order.id } }).catch(() => {});

  return NextResponse.json({ created: true, orderId: order.id, orderCode: order.orderCode });
}
