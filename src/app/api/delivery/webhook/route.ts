import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/apiHelpers";
import { mapSrStatus } from "@/lib/shiprocket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public shipment-status webhook on a CLEAN path (Shiprocket blocks URLs containing
// shiprocket/kartrocket/sr/kr). Always returns 200 (open access, POST). Updates
// Order.shippingStatus when x-api-key matches SHIPROCKET_WEBHOOK_TOKEN.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-api-key");
  if (process.env.SHIPROCKET_WEBHOOK_TOKEN && token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) return ok({ ignored: true });
  const body = await req.json().catch(() => ({}));
  const awb = body?.awb || body?.awb_code;
  const status = body?.current_status || body?.shipment_status || body?.status;
  if (awb && status) {
    const order = await prisma.order.findFirst({ where: { awbCode: String(awb) } });
    if (order) {
      const blob = JSON.stringify(body || {}); const mapped = mapSrStatus(String(status)); const upd: any = { shippingStatus: mapped.stage || String(status), trackingStage: mapped.stage || String(status), lastTrackedAt: new Date(), rtoStatus: /\brto\b/i.test(blob) ? "RTO" : null, ndrStatus: /\bndr\b|undeliver/i.test(blob) ? "NDR" : null }; if (mapped.crmStatus) upd.orderStatus = mapped.crmStatus; await prisma.order.update({ where: { id: order.id }, data: upd });
      await prisma.orderHistory.create({ data: { orderId: order.id, status: "Shipping: " + (mapped.stage || String(status)) } });
    }
  }
  return ok({ received: true });
}