import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok, bad, audit } from "@/lib/apiHelpers";
import { isSuperAdmin } from "@/lib/permissions";
import { parseTags, serializeTags } from "@/lib/dbHelpers";
export const runtime = "nodejs";

// DB-driven sources (no code deploy needed to add a channel).
// GET ?all=1 -> include disabled (Settings management). Default -> active only (order forms, filters).
export async function GET(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const where = all ? {} : { isActive: true };
  const sources = await prisma.source.findMany({ where, orderBy: { name: "asc" } });
  return ok({ sources });
}

// Add source (SUPER_ADMIN only - Settings is the CRM Control Center).
export async function POST(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Forbidden - SUPER_ADMIN only", 403);
  const { name } = await req.json().catch(() => ({}));
  const nm = (name || "").trim();
  if (!nm) return bad("name required");
  const source = await prisma.source.upsert({ where: { name: nm }, update: { isActive: true }, create: { name: nm } });
  await audit(g.user.id, "master.source.add", "source", source.id, { name: nm });
  return ok({ source }, 201);
}

// Edit source: rename (propagates to orders.source + sourceTags) and/or enable-disable. SUPER_ADMIN only.
export async function PUT(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Forbidden - SUPER_ADMIN only", 403);
  const { id, name, isActive } = await req.json().catch(() => ({}));
  if (!id) return bad("id required");
  const sec = await prisma.source.findUnique({ where: { id: Number(id) } });
  if (!sec) return bad("Source not found", 404);

  const nm = (name == null ? "" : String(name)).trim();
  const renaming = nm !== "" && nm !== sec.name;

  if (renaming) {
    const clash = await prisma.source.findFirst({ where: { name: nm } });
    if (clash) return bad("A source named '" + nm + "' already exists. Use Merge instead.", 409);
    const moved = await prisma.order.updateMany({ where: { source: sec.name }, data: { source: nm } });
    const tagged = await prisma.order.findMany({ where: { sourceTags: { contains: '"' + sec.name + '"' } }, select: { id: true, sourceTags: true } });
    for (const o of tagged) {
      const next = Array.from(new Set(parseTags(o.sourceTags).map((t) => (t === sec.name ? nm : t))));
      await prisma.order.update({ where: { id: o.id }, data: { sourceTags: serializeTags(next) } });
    }
    const updated = await prisma.source.update({ where: { id: sec.id }, data: { name: nm, ...(typeof isActive === "boolean" ? { isActive } : {}) } });
    await audit(g.user.id, "master.source.rename", "source", sec.id, { from: sec.name, to: nm, ordersMoved: moved.count, tagsUpdated: tagged.length });
    return ok({ source: updated, ordersMoved: moved.count, tagsUpdated: tagged.length });
  }

  const data: any = {};
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (Object.keys(data).length === 0) return bad("nothing to update");
  const updated = await prisma.source.update({ where: { id: sec.id }, data });
  await audit(g.user.id, "master.source.toggle", "source", sec.id, { name: sec.name, isActive: data.isActive });
  return ok({ source: updated });
}
