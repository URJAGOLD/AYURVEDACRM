import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, bad } from "@/lib/apiHelpers";
import { trackShipment, mapSrStatus, shiprocketError } from "@/lib/shiprocket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Statuses that are final - no need to keep tracking
const TERMINAL = ["Delivered", "GPO Delivered", "Cancelled", "Confirm cancel", "Final cancel", "Dealer Cancel", "RTO"];

// POST (cron) -> refresh live tracking for all booked, non-terminal orders.
// Auth: header x-api-key must equal SHIPROCKET_WEBHOOK_TOKEN (same token as the delivery webhook).
// Called by a systemd timer every few hours. Idempotent + paced + per-order error isolation.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-api-key");
  if (!process.env.SHIPROCKET_WEBHOOK_TOKEN || token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) return bad("Unauthorized", 401);

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") || 40), 100);
  const minHours = Number(sp.get("minHours") || 2);
  const cutoff = new Date(Date.now() - minHours * 3600 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      isDeleted: false,
      awbCode: { not: null },
      orderStatus: { notIn: TERMINAL },
      OR: [{ lastTrackedAt: null }, { lastTrackedAt: { lt: cutoff } }],
    },
    orderBy: { lastTrackedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, awbCode: true, orderStatus: true, trackingStage: true },
  });

  let updated = 0, changed = 0, errors = 0;
  const results: any[] = [];
  for (const o of orders) {
    try {
      const td: any = await trackShipment(o.awbCode as string);
      const trackArr: any[] = Array.isArray(td?.shipment_track) ? td.shipment_track : [];
      const acts: any[] = Array.isArray(td?.shipment_track_activities) ? td.shipment_track_activities : [];
      const stageRaw = trackArr[0]?.current_status || acts[0]?.activity || acts[0]?.status || (td?.shipment_status != null ? String(td.shipment_status) : null) || null;
      const etdRaw = trackArr[0]?.edd || td?.etd || null;
      const blob = JSON.stringify(td || {});
      const rto = /\brto\b/i.test(blob) ? "RTO" : null;
      const ndr = /\bndr\b|undeliver|not delivered|delivery attempt fail/i.test(blob) ? "NDR" : null;
      const mapped = mapSrStatus(String(stageRaw || ""));
      const newStage = mapped.stage || (stageRaw ? String(stageRaw) : null);
      const data: any = { lastTrackedAt: new Date(), rtoStatus: rto, ndrStatus: ndr };
      if (newStage) { data.trackingStage = newStage; data.shippingStatus = newStage; if (mapped.crmStatus) data.orderStatus = mapped.crmStatus; }
      if (etdRaw) { const dd = new Date(etdRaw); if (!isNaN(dd.getTime())) data.expectedDelivery = dd; }
      const stageChanged = !!(newStage && newStage !== o.trackingStage);
      const statusChanged = !!(mapped.crmStatus && mapped.crmStatus !== o.orderStatus);
      await prisma.order.update({ where: { id: o.id }, data });
      if (stageChanged || statusChanged) {
        changed++;
        await prisma.orderHistory.create({ data: { orderId: o.id, status: "Auto-track: " + (newStage || "update") + (statusChanged ? " -> " + mapped.crmStatus : "") } });
      }
      updated++;
      results.push({ id: o.id, awb: o.awbCode, stage: newStage, crm: mapped.crmStatus || null, changed: stageChanged || statusChanged });
    } catch (e) {
      errors++;
      await prisma.order.update({ where: { id: o.id }, data: { lastTrackedAt: new Date() } }).catch(() => {});
      results.push({ id: o.id, awb: o.awbCode, error: shiprocketError(e) });
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return ok({ scanned: orders.length, updated, changed, errors, ranAt: new Date().toISOString(), results });
}