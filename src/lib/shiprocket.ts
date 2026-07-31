/**
 * SHIPROCKET SERVICE (src/lib/shiprocket.ts)
 * Creds: active ShiprocketAccount (DB, password decrypted) -> .env fallback.
 * Token cached per-account. All existing exported functions preserved.
 */
import axios, { AxiosInstance } from "axios";
import { cache } from "./redis";
import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";

const DEFAULT_BASE = "https://apiv2.shiprocket.in/v1/external";

interface SrConfig { id: number; email: string; password: string; baseUrl: string; pickupLocation: string; }

async function activeConfig(): Promise<SrConfig> {
  try {
    const acc = await prisma.shiprocketAccount.findFirst({ where: { isActive: true } });
    if (acc && acc.passwordEnc) {
      return { id: acc.id, email: acc.email, password: decryptSecret(acc.passwordEnc), baseUrl: acc.baseUrl || DEFAULT_BASE, pickupLocation: acc.pickupLocation || "Primary" };
    }
  } catch { /* fall through to env */ }
  return { id: 0, email: process.env.SHIPROCKET_EMAIL || "", password: process.env.SHIPROCKET_PASSWORD || "", baseUrl: process.env.SHIPROCKET_BASE_URL || DEFAULT_BASE, pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary" };
}
const tokenKey = (id: number) => "shiprocket_token_" + id;

export async function getShiprocketToken(): Promise<string> {
  const cfg = await activeConfig();
  const k = tokenKey(cfg.id);
  const cached = await cache.get(k);
  if (cached) return cached;
  if (!cfg.email || !cfg.password) throw new Error("Shiprocket creds missing - add an account in the CRM Shiprocket module");
  const res = await axios.post(cfg.baseUrl + "/auth/login", { email: cfg.email, password: cfg.password });
  const token = res.data?.token;
  if (!token) throw new Error("Shiprocket login failed - no token");
  await cache.set(k, token, 9 * 24 * 60 * 60);
  return token;
}
export async function clearShiprocketTokenCache(id?: number) {
  if (id != null) { await cache.del(tokenKey(id)); return; }
  const cfg = await activeConfig(); await cache.del(tokenKey(cfg.id)); await cache.del(tokenKey(0));
}

async function srClient(): Promise<AxiosInstance> {
  const cfg = await activeConfig();
  const token = await getShiprocketToken();
  return axios.create({ baseURL: cfg.baseUrl, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, timeout: 30000 });
}
async function withAuthRetry<T>(fn: (c: AxiosInstance) => Promise<T>): Promise<T> {
  try { return await fn(await srClient()); }
  catch (err: any) {
    if (err?.response?.status === 401) { await clearShiprocketTokenCache(); return await fn(await srClient()); }
    throw err;
  }
}

export async function loginWithCreds(email: string, password: string, baseUrl?: string): Promise<string> {
  const res = await axios.post((baseUrl || DEFAULT_BASE) + "/auth/login", { email, password }, { timeout: 30000 });
  const token = res.data?.token;
  if (!token) throw new Error("Login failed - no token returned");
  return token;
}
export async function fetchPickupLocations(token: string, baseUrl?: string): Promise<any[]> {
  const res = await axios.get((baseUrl || DEFAULT_BASE) + "/settings/company/pickup", { headers: { Authorization: "Bearer " + token }, timeout: 30000 });
  return res.data?.data?.shipping_address ?? res.data?.data ?? [];
}

export interface CrmOrderForShiprocket {
  orderCode: string; dateTime: Date; customerName: string; contactNumber: string; email?: string | null;
  address: string; city: string; pincode: string; stateName: string;
  productName: string; productSku?: string | null; quantity: number; price: number; paymentStatus: string;
}

export async function bookOrderOnShiprocket(order: CrmOrderForShiprocket) {
  const cfg = await activeConfig();
  const payload = {
    order_id: order.orderCode,
    order_date: order.dateTime.toISOString().split("T")[0],
    pickup_location: cfg.pickupLocation,
    billing_customer_name: order.customerName, billing_last_name: "",
    billing_address: order.address, billing_city: order.city, billing_pincode: order.pincode,
    billing_state: order.stateName, billing_country: "India",
    billing_email: order.email || "noemail@prakritiherbs.in", billing_phone: order.contactNumber,
    shipping_is_billing: true,
    order_items: [{ name: order.productName, sku: order.productSku || order.productName.replace(/\s+/g, "-").toUpperCase(), units: order.quantity, selling_price: Number(order.price) }],
    payment_method: order.paymentStatus === "Completed" ? "Prepaid" : "COD",
    sub_total: Number(order.price) * order.quantity,
    length: Number(process.env.DEFAULT_PACKAGE_LENGTH || 15),
    breadth: Number(process.env.DEFAULT_PACKAGE_BREADTH || 12),
    height: Number(process.env.DEFAULT_PACKAGE_HEIGHT || 6),
    weight: Number(process.env.DEFAULT_PACKAGE_WEIGHT || 0.5),
  };
  return withAuthRetry(async (c) => {
    const res = await c.post("/orders/create/adhoc", payload);
    return { shiprocketOrderId: String(res.data?.order_id ?? ""), shipmentId: String(res.data?.shipment_id ?? ""), status: res.data?.status, raw: res.data, payload };
  });
}

export function mapSrStatus(raw: string): { stage: string; crmStatus: string | null } {
  // stage  = granular Shiprocket label (drives the Shipment filter / shipment timeline)
  // crmStatus = canonical CRM sales status. Owner rule: "courier mein lag gaya" (booked / in courier) == GPO Done;
  //             Shiprocket Delivered == GPO Delivered (counts as a sale). null = do not change CRM status.
  const s = String(raw || "").toUpperCase();
  if (!s) return { stage: "", crmStatus: null };
  const has = (x: string) => s.includes(x);
  // --- exceptions / terminal first ---
  if (has("RTO") && has("DELIVER")) return { stage: "RTO Delivered", crmStatus: "RTO" };
  if (has("RTO")) return { stage: "RTO Initiated", crmStatus: "RTO" };
  if (has("RETURN")) return { stage: "Returned", crmStatus: "RTO" };
  if (has("CANCEL")) return { stage: "Cancelled", crmStatus: "Cancelled" };
  if (has("LOST")) return { stage: "Lost", crmStatus: null };
  if (has("DAMAGE")) return { stage: "Damaged", crmStatus: null };
  if (has("NDR") || has("UNDELIVER") || has("NOT DELIVERED") || has("DELIVERY ATTEMPT")) return { stage: "NDR", crmStatus: null };
  // --- courier delivered = sale ---
  if (has("OUT FOR DELIVERY") || has("OUT_FOR_DELIVERY") || has("OFD")) return { stage: "Out For Delivery", crmStatus: "GPO Done" };
  if (has("DELIVERED")) return { stage: "Delivered", crmStatus: "GPO Delivered" };
  // --- in courier / dispatched = GPO Done ---
  if (has("IN TRANSIT") || has("IN_TRANSIT") || has("IN-TRANSIT") || has("SHIPPED") || has("DISPATCH") || has("PICKED UP") || has("PICKED_UP")) return { stage: "In Transit", crmStatus: "GPO Done" };
  if (has("PICKUP")) return { stage: "Pickup Scheduled", crmStatus: "GPO Done" };
  if (has("AWB ASSIGNED") || has("AWB_ASSIGNED") || has("AWB GENERATED")) return { stage: "AWB Assigned", crmStatus: "GPO Done" };
  if (has("READY TO SHIP") || has("READY_TO_SHIP")) return { stage: "Ready To Ship", crmStatus: "GPO Done" };
  if (s === "NEW") return { stage: "Booked", crmStatus: "GPO Done" };
  return { stage: String(raw), crmStatus: null };
}

export async function generateAWB(shipmentId: string, courierId?: number) {
  return withAuthRetry(async (c) => {
    const res = await c.post("/courier/assign/awb", { shipment_id: shipmentId, ...(courierId ? { courier_id: courierId } : {}) });
    const d = res.data?.response?.data;
    return { awbCode: d?.awb_code ?? null, courierName: d?.courier_name ?? null, raw: res.data };
  });
}
export async function requestPickup(shipmentId: string) {
  return withAuthRetry(async (c) => (await c.post("/courier/generate/pickup", { shipment_id: [shipmentId] })).data);
}
export async function generateLabel(shipmentId: string): Promise<string | null> {
  return withAuthRetry(async (c) => (await c.post("/courier/generate/label", { shipment_id: [shipmentId] })).data?.label_url ?? null);
}
export async function generateManifest(shipmentId: string): Promise<string | null> {
  return withAuthRetry(async (c) => (await c.post("/manifests/generate", { shipment_id: [shipmentId] })).data?.manifest_url ?? null);
}
export async function trackShipment(awbCode: string) {
  return withAuthRetry(async (c) => { const res = await c.get("/courier/track/awb/" + awbCode); return res.data?.tracking_data ?? res.data; });
}
export async function cancelShipment(ids: string[]) {
  return withAuthRetry(async (c) => (await c.post("/orders/cancel", { ids })).data);
}
export async function checkServiceability(deliveryPin: string, opts: { pickupPin?: string; weight?: number; cod?: 0 | 1 } = {}) {
  return withAuthRetry(async (c) => {
    const res = await c.get("/courier/serviceability/", { params: {
      pickup_postcode: opts.pickupPin || process.env.COMPANY_PINCODE || "302012",
      delivery_postcode: deliveryPin, weight: opts.weight ?? 0.5, cod: opts.cod ?? 1,
    }});
    return res.data?.data?.available_courier_companies ?? [];
  });
}
export function shiprocketError(err: any): string {
  return err?.response?.data?.message || (err?.response?.data ? JSON.stringify(err.response.data) : null) || err?.message || "Unknown Shiprocket error";
}
export async function fetchOrdersList(opts: { page?: number; per_page?: number; from?: string; to?: string } = {}): Promise<any[]> {
  return withAuthRetry(async (c) => {
    const params: any = { page: opts.page ?? 1, per_page: opts.per_page ?? 50 };
    if (opts.from) params.from = opts.from;
    if (opts.to) params.to = opts.to;
    const res = await c.get("/orders", { params });
    return res.data?.data ?? res.data?.orders ?? [];
  });
}

export async function fetchOrderDetail(shiprocketOrderId: string): Promise<any> {
  return withAuthRetry(async (c) => {
    const res = await c.get("/orders/show/" + shiprocketOrderId);
    return res.data?.data ?? res.data ?? null;
  });
}

export async function getCourierOptions(deliveryPin: string, opts: { pickupPin?: string; weight?: number; cod?: 0 | 1 } = {}) {
  return withAuthRetry(async (c) => {
    const res = await c.get("/courier/serviceability/", { params: {
      pickup_postcode: opts.pickupPin || process.env.COMPANY_PINCODE || "302012",
      delivery_postcode: deliveryPin, weight: opts.weight ?? 0.5, cod: opts.cod ?? 1,
    }});
    const d = res.data?.data || {};
    return { couriers: d.available_courier_companies ?? [], recommendedId: d.recommended_courier_company_id ?? null, recommendedBy: d.recommended_by ?? null, recommendationLevel: d.recommendation_level ?? null };
  });
}