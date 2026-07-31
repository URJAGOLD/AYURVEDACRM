import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// Returns one row per conversation (distinct waContactId) with the latest message preview.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "whatsapp.view");
  if (g instanceof Response) return g;

  const latest = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT ON ("waContactId")
      "waContactId", "contactName", "body", "direction", "createdAt", "status"
    FROM "WhatsAppMessage"
    ORDER BY "waContactId", "createdAt" DESC
  `);

  const rows = latest
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((r) => ({
      waContactId: r.waContactId,
      contactName: r.contactName,
      lastMessage: r.body,
      lastDirection: r.direction,
      lastAt: r.createdAt,
      status: r.status,
    }));

  return ok({ conversations: rows });
}
