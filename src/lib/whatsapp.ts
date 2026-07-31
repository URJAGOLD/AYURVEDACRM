// WhatsApp Cloud API (Meta) service.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Required env vars:
//   WHATSAPP_PHONE_NUMBER_ID  - from Meta App > WhatsApp > API Setup
//   WHATSAPP_ACCESS_TOKEN     - permanent access token (System User token recommended)
//   WHATSAPP_VERIFY_TOKEN     - any string you choose, must match what you enter in Meta's webhook config
//   WHATSAPP_API_VERSION      - optional, defaults to v19.0

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v19.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";

function baseUrl() {
  return `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
}

export function isConfigured() {
  return Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);
}

/** Normalize a phone number to digits-only with country code (assumes India +91 if 10 digits given). */
export function normalizeWaNumber(raw: string): string {
  let n = String(raw || "").replace(/\D/g, "");
  if (n.length === 10) n = "91" + n;
  if (n.startsWith("0") && n.length === 11) n = "91" + n.slice(1);
  return n;
}

export async function sendTextMessage(toRaw: string, body: string): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  if (!isConfigured()) return { ok: false, error: "WhatsApp not configured - set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN" };
  const to = normalizeWaNumber(toRaw);
  try {
    const res = await fetch(baseUrl(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || "Send failed" };
    }
    const waMessageId = data?.messages?.[0]?.id;
    return { ok: true, waMessageId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
