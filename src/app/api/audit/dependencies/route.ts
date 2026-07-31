import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";

export const runtime = "nodejs";

/**
 * GET /api/audit/dependencies?auditId=X
 * Returns later audit entries that touched the same order IDs.
 * Used by the Rollback Warning UI.
 */
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;

  const auditId = Number(req.nextUrl.searchParams.get("auditId"));
  if (!auditId) return bad("auditId required");

  const entry = await prisma.auditLog.findUnique({ where: { id: auditId } });
  if (!entry) return bad("Audit entry not found", 404);

  // Parse affected order IDs from entityId
  const affectedIds: number[] = (entry.entityId ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => n > 0 && n < 1e9);

  if (affectedIds.length === 0) return ok({ dependencies: [], affectedIds: [] });

  // Find all later audit entries that overlap these IDs
  // Strategy: fetch entries after this one, filter by entityId overlap
  const laterEntries = await prisma.auditLog.findMany({
    where: {
      id: { gt: auditId },
      entityType: "order",
      action: { not: { startsWith: "rollback." } },
    },
    orderBy: { id: "asc" },
    take: 500,
    include: { user: { select: { name: true, role: true } } },
  });

  const affectedSet = new Set(affectedIds);
  const deps: any[] = [];

  for (const e of laterEntries) {
    const eIds = (e.entityId ?? "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => n > 0);
    const overlap = eIds.filter((id) => affectedSet.has(id));
    if (overlap.length > 0) {
      const d: any = typeof e.details === "string" ? (() => { try { return JSON.parse(e.details); } catch { return {}; } })() : (e.details || {});
      deps.push({
        id: e.id,
        action: e.action,
        createdAt: e.createdAt,
        user: e.user,
        overlapIds: overlap,
        overlapCount: overlap.length,
        // What changed in the dependent action
        changedFields: d.changed ?? (d.leadOwnerId !== undefined ? ["leadOwnerId"] : d.status ? ["orderStatus"] : []),
        afterSummary: (() => {
          if (d.leadOwnerId !== undefined) return "leadOwner → " + (d.leadOwnerId ?? "Unassigned");
          if (d.status) return "status → " + d.status;
          if (d.changed) return "fields: " + (d.changed as string[]).slice(0, 4).join(", ");
          return "";
        })(),
      });
    }
  }

  return ok({ dependencies: deps, affectedIds, totalAffected: affectedIds.length });
}