import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { sendTextMessage, normalizeWaNumber } from "@/lib/whatsapp";

export const runtime = "nodejs";

// GET: full message history with one contact, oldest first.
export async function GET(req: NextRequest, { params }: { params: { contact: string } }) {
  const g = requirePermission(req, "whatsapp.view");
  if (g instanceof Response) return g;

  const waContactId = normalizeWaNumber(params.contact);
  const messages = await prisma.whatsAppMessage.findMany({
    where: { waContactId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return ok({ messages });
}

// POST: send a new outbound message to this contact.
export async function POST(req: NextRequest, { params }: { params: { contact: string } }) {
  const g = requirePermission(req, "whatsapp.send");
  if (g instanceof Response) return g;
  const { user } = g;

  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || "").trim();
  if (!text) return bad("Message text is required");

  const waContactId = normalizeWaNumber(params.contact);
  const result = await sendTextMessage(waContactId, text);

  if (!result.ok) {
    return bad(result.error || "Failed to send WhatsApp message", 502);
  }

  const saved = await prisma.whatsAppMessage.create({
    data: {
      waContactId, direction: "outbound", messageType: "text",
      body: text, waMessageId: result.waMessageId, status: "sent",
      sentById: user.id,
    },
  });

  await audit(user.id, "whatsapp.send", "WhatsAppMessage", saved.id, { to: waContactId });

  return ok({ message: saved });
}
