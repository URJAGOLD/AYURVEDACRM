import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/apiHelpers";
import { buildOrderCode } from "@/lib/excel";
import { normalizePhone } from "@/lib/smartImport";
import { parseTags, serializeTags } from "@/lib/dbHelpers";

export const runtime = "nodejs";
const clean = (v: any) => (v == null ? "" : String(v).trim());

// Admin panel status -> CRM order status
function mapAdminStatus(s: string): string | null {
  const v = s.toLowerCase();
  if (!v) return null;
  if (v === "new") return "New";
  if (v === "confirmed") return "Confirmed";
  if (v === "shipped") return "GPO Done";
  if (v === "delivered") return "GPO Delivered";
  if (v === "cancelled" || v === "canceled") return "Cancelled";
  if (v === "pending") return "Pending";
  return s; // pass through unknown values
}

// One-way ingest from Admin. Dedupe by mobile, source tags, timeline, idempotent, pincode intelligence.
export async function POST(req: NextRequest) {
  const secret = process.env.CRM_INGEST_SECRET;
  if (!secret) return bad("Ingest not configured", 503);
  if (req.headers.get("x-ingest-secret") !== secret) return bad("Unauthorized", 401);

  const b = await req.json().catch(() => ({} as any));
  const source = clean(b.source) || "Unknown";
  const mobile = normalizePhone(clean(b.mobile || b.phone));
  if (mobile.length !== 10) return bad("mobile must be 10 digits");
  const externalId = clean(b.externalId) || (source + ":" + mobile + ":" + clean(b.event));

  let isRepeatEvent = false;
  try { await prisma.syncEvent.create({ data: { source, externalId, mobile } }); }
  catch {
    if (source !== "Orders") return ok({ duplicate: true });
    isRepeatEvent = true; // Orders: same externalId again = UPDATE sync from admin
  }

  const name = clean(b.name) || "Unknown";
  const address = clean(b.address);

  let pin = clean(b.pincode).replace(/\D/g, "");
  if (!/^\d{6}$/.test(pin)) { const m = address.match(/\b(\d{6})\b/); pin = m ? m[1] : ""; }

  let city = clean(b.city);
  const stName = clean(b.state);
  let stateId: number | null = null;
  if (stName) { const st = await prisma.state.findFirst({ where: { name: { equals: stName, mode: "insensitive" } }, select: { id: true } }); stateId = st?.id ?? null; }
  let districtId: number | null = null;

  if (pin) {
    const geo = await prisma.pincode.findUnique({ where: { pincode: pin } }).catch(() => null);
    if (geo) {
      if (!city && geo.place) city = geo.place;
      if (!stateId && geo.state) { const st = await prisma.state.findFirst({ where: { name: { equals: geo.state, mode: "insensitive" } }, select: { id: true } }); stateId = st?.id ?? null; }
      if (geo.district && stateId) { const dt = await prisma.district.findFirst({ where: { name: { equals: geo.district, mode: "insensitive" }, stateId }, select: { id: true } }); districtId = dt?.id ?? null; }
    }
  }

  let total = parseFloat(clean(b.amount).replace(/[^0-9.]/g, ""));
  const qty = parseInt(clean(b.quantity), 10);
  const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
  if (!Number.isFinite(total) || total <= 0) total = 999 * q;
  const unit = +(total / q).toFixed(2);
  const evAt = clean(b.eventAt); const evDate = evAt ? new Date(evAt) : null;
  const note = clean(b.notes) || clean(b.event) || ("Synced from " + source);
  const alt = clean(b.altMobile) ? (normalizePhone(clean(b.altMobile)) || null) : null;

  // ── ORDERS: every admin order gets its OWN dedicated CRM row ──────────────
  // Dedup ONLY by externalRef (order-<adminId>). Repeat event = field update sync.
  if (source === "Orders" && clean(b.externalId)) {
    const dedicated = await prisma.order.findFirst({ where: { externalRef: clean(b.externalId), isDeleted: false } });
    if (dedicated) {
      const upd: any = {};
      if (clean(b.name) && clean(b.name).toLowerCase() !== "unknown" && dedicated.customerName !== clean(b.name)) upd.customerName = clean(b.name);
      if (address && dedicated.address !== address) upd.address = address;
      if (city && dedicated.city !== city) upd.city = city;
      if (pin && dedicated.pincode !== pin) upd.pincode = pin;
      if (stateId && dedicated.stateId !== stateId) upd.stateId = stateId;
      if (districtId && dedicated.districtId !== districtId) upd.districtId = districtId;
      if (clean(b.email) && dedicated.email !== clean(b.email)) upd.email = clean(b.email);
      if (clean(b.paymentMode) && dedicated.paymentMode !== clean(b.paymentMode)) upd.paymentMode = clean(b.paymentMode);
      if (clean(b.paymentStatus) && dedicated.paymentStatus !== clean(b.paymentStatus)) upd.paymentStatus = clean(b.paymentStatus);
      if (alt && !dedicated.altMobile) upd.altMobile = alt;
      const mapped = mapAdminStatus(clean(b.status));
      if (mapped && dedicated.orderStatus !== mapped) { upd.orderStatus = mapped; }
      if (Object.keys(upd).length > 0) {
        await prisma.order.update({ where: { id: dedicated.id }, data: upd });
        await prisma.orderHistory.create({ data: { orderId: dedicated.id, status: "[Sync] Admin update", remark: "Fields: " + Object.keys(upd).join(", "), ...(evDate ? { createdAt: evDate } : {}) } });
      }
      if (!isRepeatEvent) await prisma.syncEvent.update({ where: { source_externalId: { source, externalId } }, data: { orderId: dedicated.id } }).catch(() => {});
      return ok({ updated: true, orderId: dedicated.id, orderCode: dedicated.orderCode, changed: Object.keys(upd) });
    }
    // No dedicated row yet -> fall through to CREATE (never merge admin orders into lead rows)
  } else {
  const existing = await prisma.order.findFirst({ where: { contactNumber: mobile, isDeleted: false }, orderBy: { id: "desc" } });

  if (existing) {
    const tags = Array.from(new Set([...parseTags(existing.sourceTags), source]));
    const upd: any = { sourceTags: serializeTags(tags) };
    if (!existing.price || Number(existing.price) === 0) { upd.price = unit; upd.totalAmount = total; }
    if ((!existing.customerName || existing.customerName === "Unknown") && clean(b.name) && clean(b.name).toLowerCase() !== "unknown") upd.customerName = clean(b.name);
    if (!existing.email && clean(b.email)) upd.email = clean(b.email);
    if (!existing.address && address) upd.address = address;
    if (!existing.city && city) upd.city = city;
    if ((!existing.pincode || existing.pincode === "111111") && pin) upd.pincode = pin;
    if (!existing.stateId && stateId) upd.stateId = stateId;
    if (!existing.districtId && districtId) upd.districtId = districtId;
    if (!existing.altMobile && alt) upd.altMobile = alt;
    if (!existing.externalRef && clean(b.externalId)) upd.externalRef = clean(b.externalId);
    await prisma.order.update({ where: { id: existing.id }, data: upd });
    await prisma.orderHistory.create({ data: { orderId: existing.id, status: "[Sync] " + (clean(b.event) || source), remark: note, ...(evDate ? { createdAt: evDate } : {}) } });
    await prisma.syncEvent.update({ where: { source_externalId: { source, externalId } }, data: { orderId: existing.id } });
    return ok({ merged: true, orderId: existing.id, orderCode: existing.orderCode, sourceTags: tags });
  }
  } // end non-Orders merge path

  // id-based code (count-based collided with Shiprocket-advanced codes)
  const last = await prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const order = await prisma.order.create({ data: {
    orderCode: buildOrderCode(349317 + (last?.id ?? 0) + 1), customerName: name, contactNumber: mobile, altMobile: alt,
    email: clean(b.email) || null, productName: clean(b.product) || "Sutra Gold+",
    quantity: q, price: unit, totalAmount: total, paymentMode: clean(b.paymentMode) || null, ...(evDate ? { dateTime: evDate } : {}),
    address, city, stateId, districtId, pincode: pin || "111111",
    source, sourceTags: JSON.stringify([source]), externalRef: clean(b.externalId) || null,
    paymentStatus: clean(b.paymentStatus) || "Pending", orderStatus: (source === "Orders" ? (mapAdminStatus(clean(b.status)) || "New") : "New"), remark: clean(b.notes) || null,
  }});
  await prisma.orderHistory.create({ data: { orderId: order.id, status: "[Sync] " + (clean(b.event) || source), remark: note, ...(evDate ? { createdAt: evDate } : {}) } });
  await prisma.syncEvent.update({ where: { source_externalId: { source, externalId } }, data: { orderId: order.id } }).catch(() => {});
  return ok({ created: true, orderId: order.id, orderCode: order.orderCode });
}