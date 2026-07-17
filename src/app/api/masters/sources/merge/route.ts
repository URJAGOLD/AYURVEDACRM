import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok, bad, audit } from "@/lib/apiHelpers";
import { isSuperAdmin } from "@/lib/permissions";
import { parseTags, serializeTags } from "@/lib/dbHelpers";
export const runtime = "nodejs";

// Duplicate Source Cleanup / Merge: move all orders from `fromId` -> `toId` (by name),
// rewrite sourceTags, then DISABLE the old source (never hard-delete). SUPER_ADMIN only.
export async function POST(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Forbidden - SUPER_ADMIN only", 403);
  const { fromId, toId } = await req.json().catch(() => ({}));
  if (!fromId || !toId) return bad("fromId and toId required");
  if (Number(fromId) === Number(toId)) return bad("Cannot merge a source into itself");
  const from = await prisma.source.findUnique({ where: { id: Number(fromId) } });
  const to = await prisma.source.findUnique({ where: { id: Number(toId) } });
  if (!from || !to) return bad("Source not found", 404);

  const moved = await prisma.order.updateMany({ where: { source: from.name }, data: { source: to.name } });
  const tagged = await prisma.order.findMany({ where: { sourceTags: { contains: '"' + from.name + '"' } }, select: { id: true, sourceTags: true } });
  for (const o of tagged) {
    const next = Array.from(new Set(parseTags(o.sourceTags).map((t) => (t === from.name ? to.name : t))));
    await prisma.order.update({ where: { id: o.id }, data: { sourceTags: serializeTags(next) } });
  }
  const disabled = await prisma.source.update({ where: { id: from.id }, data: { isActive: false } });
  await audit(g.user.id, "master.source.merge", "source", from.id, { from: from.name, to: to.name, ordersMoved: moved.count, tagsUpdated: tagged.length });
  return ok({ ok: true, from: from.name, to: to.name, ordersMoved: moved.count, tagsUpdated: tagged.length, disabledId: disabled.id });
}
