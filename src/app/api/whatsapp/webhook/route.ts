import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Meta calls this once when you set up the webhook, to verify you own the endpoint.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN || "";
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Meta calls this for every incoming message / status update once subscribed.
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Incoming customer messages
    const messages = value?.messages || [];
    for (const m of messages) {
      const waContactId = m.from as string;
      const contactName = value?.contacts?.[0]?.profile?.name || null;
      const waMessageId = m.id as string;
      let body: string | null = null;
      let mediaUrl: string | null = null;
      const messageType = m.type || "text";

      if (m.type === "text") body = m.text?.body ?? null;
      else if (m.type === "button") body = m.button?.text ?? null;
      else if (m.type === "interactive") body = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || null;
      else body = `[${m.type} message]`;

      await prisma.whatsAppMessage.upsert({
        where: { waMessageId },
        update: {},
        create: {
          waContactId, contactName, waMessageId, direction: "inbound",
          messageType, body, mediaUrl, status: "received",
        },
      }).catch((e) => console.error("[whatsapp webhook] store inbound failed", e));
    }

    // Delivery/read status updates for messages we sent
    const statuses = value?.statuses || [];
    for (const s of statuses) {
      const waMessageId = s.id as string;
      const status = s.status as string; // sent | delivered | read | failed
      await prisma.whatsAppMessage.updateMany({
        where: { waMessageId },
        data: { status },
      }).catch(() => {});
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[whatsapp webhook] error", e);
    // Always 200 back to Meta so it doesn't disable the webhook after a parse hiccup.
    return NextResponse.json({ received: true });
  }
}
