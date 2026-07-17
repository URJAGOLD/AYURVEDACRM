import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok, bad, audit } from "@/lib/apiHelpers";
import { isSuperAdmin } from "@/lib/permissions";
export const runtime = "nodejs";

// Phase 3B: dealer master management. Dealer model existed (orders link by dealerId FK),
// this adds the missing API. Rename is fully safe: orders reference dealers by id, not name.
// GET ?all=1 -> include disabled (Settings management + OrderForm current-value safety).
// Default -> active only.
export async function GET(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const where = all ? {} : { isActive: true };
  const dealers = await prisma.dealer.findMany({
    where, orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, isActive: true },
  });
  return ok({ dealers });
}

// Add dealer (SUPER_ADMIN only - Settings is the CRM Control Center).
export async function POST(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Forbidden - SUPER_ADMIN only", 403);
  const b = await req.json().catch(() => ({}));
  const nm = String(b.name || "").trim();
  if (!nm) return bad("name required");
  const clash = await prisma.dealer.findFirst({ where: { name: { equals: nm, mode: "insensitive" } } });
  if (clash) return bad("Dealer '" + clash.name + "' pehle se hai" + (clash.isActive ? "" : " (abhi disabled hai - Enable karein)"), 409);
  const dealer = await prisma.dealer.create({ data: { name: nm, city: b.city ? String(b.city).trim() : null } });
  await audit(g.user.id, "master.dealer.add", "dealer", dealer.id, { name: nm, city: dealer.city });
  return ok({ dealer }, 201);
}

// Edit dealer: rename (safe - FK by id) / city / enable-disable. SUPER_ADMIN only.
export async function PUT(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Forbidden - SUPER_ADMIN only", 403);
  const b = await req.json().catch(() => ({}));
  if (!b.id) return bad("id required");
  const d = await prisma.dealer.findUnique({ where: { id: Number(b.id) } });
  if (!d) return bad("Dealer not found", 404);

  const data: any = {};
  if (b.name != null) {
    const nm = String(b.name).trim();
    if (!nm) return bad("name khali nahi ho sakta");
    if (nm !== d.name) {
      const clash = await prisma.dealer.findFirst({ where: { name: { equals: nm, mode: "insensitive" }, id: { not: d.id } } });
      if (clash) return bad("Dealer '" + clash.name + "' pehle se hai", 409);
      data.name = nm;
    }
  }
  if (b.city !== undefined) data.city = b.city == null || String(b.city).trim() === "" ? null : String(b.city).trim();
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;
  if (Object.keys(data).length === 0) return bad("nothing to update");

  const updated = await prisma.dealer.update({ where: { id: d.id }, data });
  await audit(g.user.id, "master.dealer.update", "dealer", d.id, { from: { name: d.name, city: d.city, isActive: d.isActive }, to: data });
  return ok({ dealer: updated });
}
