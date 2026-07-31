import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";
import { parseTags } from "@/lib/dbHelpers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const rows = await prisma.order.findMany({ where: { isDeleted: false }, select: { source: true, sourceTags: true } });
  const set = new Set<string>();
  for (const r of rows) { if (r.source) set.add(r.source); parseTags(r.sourceTags).forEach((t) => set.add(t)); }
  return ok({ sources: Array.from(set).sort() });
}