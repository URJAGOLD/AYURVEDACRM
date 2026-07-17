import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { fetchOrdersList, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min (Vercel edge limit; ignored on VPS)

// ─── helpers ─────────────────────────────────────────────────────────────────
const s = (v: any) => (v == null ? "" : String(v).trim());
const phone = (v: any) => s(v).replace(/\D/g, "").slice(-10);

async function resolveStateId(name: string, cache: Map<string, number | null>): Promise<number | null> {
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const st = await prisma.state.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const id = st?.id ?? null;
  cache.set(key, id);
  return id;
}

function extractFromSrOrder(o: any): { customerName: string; contactNumber: string; email: string | null; address: string; city: string; stateName: string; pincode: string; productName: string; qty: number; price: number; paymentMode: string; paymentStatus: string; srOrderId: string; shipmentId: string | null; awbCode: string | null; courierName: string | null; } {
  const items: any[] = o?.products ?? o?.order_items ?? [];
  const item = items[0] ?? {};
  const pm = s(o?.payment_method ?? o?.payment_mode ?? "").toUpperCase();
  return {
    customerName: s(o?.billing_customer_name ?? o?.channel_order_id ?? "Unknown"),
    contactNumber: phone(o?.billing_phone ?? o?.phone ?? ""),
    email: s(o?.billing_email ?? o?.email ?? "") || null,
    address: s(o?.billing_address ?? o?.address ?? ""),
    city: s(o?.billing_city ?? o?.city ?? ""),
    stateName: s(o?.billing_state ?? o?.state ?? ""),
    pincode: s(o?.billing_pincode ?? o?.pincode ?? "111111") || "111111",
    productName: s(item?.name ?? item?.sku ?? o?.product ?? "Sutra Gold+") || "Sutra Gold+",
    qty: Number(item?.units ?? item?.quantity ?? o?.total_quantity ?? 1) || 1,
    price: Number(o?.sub_total ?? item?.selling_price ?? item?.price ?? 999) || 999,
    paymentMode: pm || "COD",
    paymentStatus: pm === "PREPAID" ? "Completed" : "Pending",
    srOrderId: s(o?.id ?? o?.order_id ?? o?.shiprocket_order_id ?? ""),
    shipmentId: s(o?.shipment_id ?? o?.shipments?.[0]?.id ?? "") || null,
    awbCode: s(o?.awb_code ?? o?.shipments?.[0]?.awb ?? "") || null,
    courierName: s(o?.courier_name ?? o?.shipments?.[0]?.courier ?? "") || null,
  };
}

// GET — status/dry-run: fetch page 1 from Shiprocket, show what would be imported
// POST { from?, to?, page_start?, page_end?, dry_run?, batch_delay_ms? }
//   → pull all orders from Shiprocket (paged), upsert into CRM
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  try {
    const rows = await fetchOrdersList({ page: 1, per_page: 10 });
    const srIds = rows.map((r: any) => s(r?.id ?? r?.order_id ?? "")).filter(Boolean);
    const existing = await prisma.order.findMany({ where: { shiprocketOrderId: { in: srIds } }, select: { shiprocketOrderId: true, orderCode: true } });
    const existSet = new Set(existing.map((e) => e.shiprocketOrderId));
    return ok({ sample_count: rows.length, would_create: rows.filter((r: any) => !existSet.has(s(r?.id ?? r?.order_id ?? ""))).length, would_skip: rows.filter((r: any) => existSet.has(s(r?.id ?? r?.order_id ?? ""))).length, sample: rows.slice(0, 3).map((r: any) => ({ sr_order_id: r?.id ?? r?.order_id, customer: r?.billing_customer_name, phone: phone(r?.billing_phone), status: r?.status ?? r?.order_status, awb: r?.awb_code })) });
  } catch (e) { return bad("Shiprocket API error: " + shiprocketError(e), 502); }
}

export async function POST(req: NextRequest) {
  // Auth: session permission OR cron x-api-key (same token as webhook/auto-track)
  const cronToken = req.headers.get("x-api-key");
  const isCron = !!process.env.SHIPROCKET_WEBHOOK_TOKEN && cronToken === process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!isCron) {
    const g = requirePermission(req, "users.manage");
    if (g instanceof Response) return g;
  }
  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body?.dry_run === true;
  const pageStart = Math.max(1, Number(body?.page_start ?? 1));
  const pageEnd = Math.min(Number(body?.page_end ?? 999), 999);
  const fromDate: string | undefined = body?.from ?? undefined; // "YYYY-MM-DD"
  const toDate: string | undefined = body?.to ?? undefined;
  const batchDelay = Math.min(Number(body?.batch_delay_ms ?? 400), 2000);

  // Load state cache
  const allStates = await prisma.state.findMany({ select: { id: true, name: true } });
  const stateCache = new Map<string, number | null>(allStates.map((s) => [s.name.toLowerCase(), s.id]));

  let page = pageStart;
  let totalFetched = 0, created = 0, updated = 0, skipped = 0, errors = 0;
  const errorList: { srOrderId: string; msg: string }[] = [];
  const createdList: { srOrderId: string; orderCode: string }[] = [];

  while (page <= pageEnd) {
    let rows: any[];
    try {
      rows = await fetchOrdersList({ page, per_page: 50, from: fromDate, to: toDate });
    } catch (e) {
      errors++;
      errorList.push({ srOrderId: "page_" + page, msg: shiprocketError(e) });
      break;
    }
    if (!rows || rows.length === 0) break; // no more pages

    totalFetched += rows.length;

    for (const srOrder of rows) {
      const d = extractFromSrOrder(srOrder);
      if (!d.srOrderId) { skipped++; continue; }

      try {
        // Dedup check: shiprocketOrderId OR awbCode
        const existing = await prisma.order.findFirst({
          where: { OR: [{ shiprocketOrderId: d.srOrderId }, ...(d.awbCode ? [{ awbCode: d.awbCode }] : [])] },
          select: { id: true, orderCode: true, orderStatus: true },
        });

        if (existing) {
          // Update AWB/shipmentId/trackingStage if missing
          const needsUpdate = !existing.orderStatus.startsWith("GPO") && d.awbCode;
          if (needsUpdate && !dryRun) {
            await prisma.order.update({ where: { id: existing.id }, data: { awbCode: d.awbCode, shipmentId: d.shipmentId, courierName: d.courierName, shiprocketOrderId: d.srOrderId, orderStatus: "GPO Done", trackingStage: d.awbCode ? "AWB Assigned" : null, bookedAt: new Date() } });
          }
          updated++;
          continue;
        }

        if (dryRun) { created++; continue; } // count only

        const stateId = await resolveStateId(d.stateName, stateCache);

        // Generate orderCode safely
        const lastOrder = await prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
        const seq = 349317 + (lastOrder?.id ?? 0) + 1;
        const prefix = process.env.ORDER_CODE_PREFIX || "AACRM";
        const orderCode = prefix + String(seq);

        const srStatus = s(srOrder?.status ?? srOrder?.order_status ?? "").toLowerCase();
        const crmStatus = srStatus.includes("deliver") ? "GPO Delivered" : srStatus.includes("rto") ? "RTO" : srStatus.includes("cancel") ? "Cancelled" : srStatus.includes("transit") || srStatus.includes("dispatch") || srStatus.includes("pickup") || srStatus.includes("awb") || d.awbCode ? "GPO Done" : "New";

        await prisma.order.create({
          data: {
            orderCode, customerName: d.customerName || "Unknown",
            contactNumber: d.contactNumber || "0000000000",
            email: d.email, address: d.address, city: d.city, stateId, pincode: d.pincode,
            productName: d.productName, quantity: d.qty, price: d.price,
            paymentMode: d.paymentMode, paymentStatus: d.paymentStatus,
            source: "Shiprocket Backfill",
            orderStatus: crmStatus,
            shiprocketOrderId: d.srOrderId, shipmentId: d.shipmentId,
            awbCode: d.awbCode, courierName: d.courierName,
            trackingStage: d.awbCode ? "AWB Assigned" : null,
            bookedAt: d.awbCode ? new Date() : null,
            remark: "Backfill import - SR order " + d.srOrderId,
          },
        });
        await prisma.orderHistory.create({ data: { orderId: (await prisma.order.findUnique({ where: { orderCode }, select: { id: true } }))!.id, status: "Backfill: Imported from Shiprocket", remark: "SR: " + d.srOrderId } });
        created++;
        createdList.push({ srOrderId: d.srOrderId, orderCode });

      } catch (e: any) {
        errors++;
        errorList.push({ srOrderId: d.srOrderId, msg: String(e?.message ?? e).slice(0, 200) });
      }
    }

    if (rows.length < 50) break; // last page
    page++;
    if (batchDelay > 0) await new Promise((r) => setTimeout(r, batchDelay));
  }

  // Update lastSyncAt for monitoring (active account)
  if (!dryRun) {
    await prisma.shiprocketAccount.updateMany({ where: { isActive: true }, data: { lastSyncAt: new Date() } }).catch(() => {});
  }

  return ok({
    dry_run: dryRun, pages_scanned: page - pageStart + 1, total_fetched: totalFetched,
    created, updated, skipped, errors,
    created_orders: createdList.slice(0, 50), // show first 50
    error_details: errorList.slice(0, 20),
  });
}