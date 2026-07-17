import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { trackShipment, shiprocketError, mapSrStatus } from "@/lib/shiprocket";

export const runtime = "nodejs";

// GET ?awb= or ?orderId= -> live tracking timeline; persists stage/etd/rto/ndr to the order.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "shiprocket.track");
  if (g instanceof Response) return g;
  let awb = req.nextUrl.searchParams.get("awb");
  const orderId = req.nextUrl.searchParams.get("orderId");
  let order: any = null;
  if (orderId) order = await prisma.order.findUnique({ where: { id: Number(orderId) }, select: { id: true, awbCode: true, courierName: true } });
  if (!awb && order) awb = order.awbCode;
  if (awb && !order) order = await prisma.order.findFirst({ where: { awbCode: awb }, select: { id: true, awbCode: true, courierName: true } });
  if (!awb) return bad("awb or orderId required");
  try {
    const td: any = await trackShipment(awb);
    const trackArr: any[] = Array.isArray(td?.shipment_track) ? td.shipment_track : [];
    const acts: any[] = Array.isArray(td?.shipment_track_activities) ? td.shipment_track_activities : [];
    const stage = trackArr[0]?.current_status || acts[0]?.activity || acts[0]?.status || (td?.shipment_status != null ? String(td.shipment_status) : null) || null;
    const etdRaw = trackArr[0]?.edd || td?.etd || null;
    const blob = JSON.stringify(td || {});
    const rto = /\brto\b/i.test(blob) ? "RTO" : null;
    const ndr = /\bndr\b|undeliver|not delivered|delivery attempt fail/i.test(blob) ? "NDR" : null;
    const timeline = acts.map((a: any) => ({ date: a.date || "", status: a["sr-status-label"] || a.status || "", activity: a.activity || "", location: a.location || "" }));
    if (order) {
      const mapped = mapSrStatus(String(stage || ""));
      const data: any = { lastTrackedAt: new Date(), rtoStatus: rto, ndrStatus: ndr };
      if (stage) { data.trackingStage = mapped.stage || String(stage); data.shippingStatus = mapped.stage || String(stage); if (mapped.crmStatus) data.orderStatus = mapped.crmStatus; }
      if (etdRaw) { const dd = new Date(etdRaw); if (!isNaN(dd.getTime())) data.expectedDelivery = dd; }
      await prisma.order.update({ where: { id: order.id }, data }).catch(() => {});
    }
    return ok({ awb, courier: order?.courierName ?? null, current: stage, etd: etdRaw, rto, ndr, timeline, tracking: td });
  } catch (e) { return bad("Track failed: " + shiprocketError(e), 502); }
}