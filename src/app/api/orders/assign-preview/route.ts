import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad } from "@/lib/apiHelpers";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

// Preview an assignment BEFORE committing.
// Powers the Duplicate-Assignment Warning (single order already assigned)
// and the Bulk-Assign Safety summary (how many already assigned vs unassigned).
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) return bad("ids[] required");

  const where: any = { id: { in: ids.map(Number) }, isDeleted: false };
  if (!can(g.user, "orders.viewAll")) where.leadOwnerId = g.user.id;

  const rows = await prisma.order.findMany({
    where,
    select: { id: true, orderCode: true, leadOwnerId: true, agentAssignDate: true, leadOwner: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });

  const assignedRows = rows.filter((r) => r.leadOwnerId != null);
  const total = rows.length;
  const assigned = assignedRows.length;
  const unassigned = total - assigned;

  const sample = assignedRows.slice(0, 8).map((r) => ({
    id: r.id, orderCode: r.orderCode,
    ownerId: r.leadOwnerId, ownerName: r.leadOwner?.name || ("#" + r.leadOwnerId),
    assignDate: r.agentAssignDate ? r.agentAssignDate.toISOString() : null,
  }));

  // Single-order convenience block for the duplicate warning popup
  const single = total === 1 ? {
    id: rows[0].id, orderCode: rows[0].orderCode,
    assigned: rows[0].leadOwnerId != null,
    ownerName: rows[0].leadOwner?.name || null,
    assignDate: rows[0].agentAssignDate ? rows[0].agentAssignDate.toISOString() : null,
  } : null;

  return ok({ total, assigned, unassigned, sample, single });
}