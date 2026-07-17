import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// ─── Rollback eligibility rules (shared with frontend logic) ─────────────────
// NEVER rollbackable: shipment/external events
const BLOCKED_PREFIXES = ["shiprocket.", "auth.", "rollback."];
const ROLLBACKABLE = new Set([
  "order.update", "order.delete", "order.bulkAssign", "order.bulkStatus", "order.bulkDelete",
  "user.update",
]);

// Order fields that need Date parsing on restore
const ORDER_DATE_FIELDS = new Set(["followUpDate", "agentAssignDate", "dealerAssignDate", "dateTime", "bookedAt", "expectedDelivery", "lastTrackedAt"]);

function parseOrderValue(key: string, v: any): any {
  if (v === null || v === undefined) return null;
  if (ORDER_DATE_FIELDS.has(key)) { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return v;
}

// POST { auditId } — revert the original action. SUPER_ADMIN only.
export async function POST(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  if (g.user.role !== "SUPER_ADMIN") return bad("Only Super Admin can rollback actions", 403);

  const body = await req.json().catch(() => ({}));
  const auditId = Number(body?.auditId);
  if (!auditId) return bad("auditId required");
  // chainMode: "assignment_only" | "full_chain" (default: "assignment_only")
  const chainMode: string = body?.chainMode ?? "assignment_only";

  const entry = await prisma.auditLog.findUnique({ where: { id: auditId }, include: { user: { select: { name: true } } } });
  if (!entry) return bad("Audit entry not found", 404);

  // Blocked categories
  if (BLOCKED_PREFIXES.some((p) => entry.action.startsWith(p))) {
    return bad("Shipment/security/external events cannot be rolled back", 400);
  }
  if (!ROLLBACKABLE.has(entry.action)) {
    return bad("Action '" + entry.action + "' is not rollbackable", 400);
  }

  // Double-rollback guard
  const already = await prisma.auditLog.findFirst({ where: { action: "rollback.executed", details: { contains: '"sourceAuditId":' + auditId } } });
  if (already) return bad("This action was already rolled back (audit #" + already.id + ")", 409);

  const d: any = typeof entry.details === "string" ? (() => { try { return JSON.parse(entry.details); } catch { return {}; } })() : (entry.details || {});
  let affected = 0;
  const restoredNote: string[] = [];

  try {
    // ─── order.update: restore before-state fields ─────────────────────────
    if (entry.action === "order.update") {
      const before = d?.before;
      if (!before || typeof before !== "object" || Object.keys(before).length === 0) {
        return bad("This audit entry has no before-state snapshot (older log) - cannot rollback", 400);
      }
      const orderId = Number(entry.entityId);
      if (!orderId) return bad("Invalid order id in audit entry");
      const restore: any = {};
      for (const [k, v] of Object.entries(before)) restore[k] = parseOrderValue(k, v);
      await prisma.order.update({ where: { id: orderId }, data: restore });
      if (restore.orderStatus) {
        await prisma.orderHistory.create({ data: { orderId, status: restore.orderStatus, remark: "Rollback of audit #" + auditId, addedById: g.user.id } });
      }
      affected = 1;
      restoredNote.push("fields: " + Object.keys(before).join(", "));
    }

    // ─── order.delete: restore record ───────────────────────────────────────
    else if (entry.action === "order.delete") {
      const orderId = Number(entry.entityId);
      if (!orderId) return bad("Invalid order id in audit entry");
      const r = await prisma.order.updateMany({ where: { id: orderId, isDeleted: true }, data: { isDeleted: false } });
      if (r.count === 0) return bad("Order is not deleted (already restored?)", 400);
      await prisma.orderHistory.create({ data: { orderId, status: "Restored", remark: "Restore via rollback of audit #" + auditId, addedById: g.user.id } });
      affected = 1;
      restoredNote.push("order restored");
    }

    // ─── order.bulkDelete: restore all ids ──────────────────────────────────
    else if (entry.action === "order.bulkDelete") {
      const ids: number[] = Array.isArray(d?.ids) ? d.ids.map(Number).filter(Boolean) : [];
      if (!ids.length) return bad("No ids stored in audit entry - cannot rollback", 400);
      const r = await prisma.order.updateMany({ where: { id: { in: ids }, isDeleted: true }, data: { isDeleted: false } });
      affected = r.count;
      restoredNote.push(r.count + " orders restored");
    }

    // ─── order.bulkAssign: restore per-order owners ─────────────────────────
    else if (entry.action === "order.bulkAssign") {
      const perOrder: any[] = d?.before?.perOrder;
      if (!Array.isArray(perOrder) || perOrder.length === 0) {
        return bad("This audit entry has no per-order before-state (older log) - cannot rollback", 400);
      }
      for (const o of perOrder) {
        const restore: any = {};
        if ("leadOwnerId" in o) { restore.leadOwnerId = o.leadOwnerId ?? null; restore.agentAssignDate = o.agentAssignDate ? new Date(o.agentAssignDate) : null; }
        if ("dealerId" in o) { restore.dealerId = o.dealerId ?? null; restore.dealerAssignDate = o.dealerAssignDate ? new Date(o.dealerAssignDate) : null; }
        await prisma.order.update({ where: { id: Number(o.id) }, data: restore }).catch(() => {});
        affected++;
      }
      restoredNote.push(affected + " orders re-assigned to previous owners");
    }

    // ─── order.bulkStatus: restore per-order statuses ───────────────────────
    else if (entry.action === "order.bulkStatus") {
      const perOrder: any[] = d?.before?.perOrder;
      if (!Array.isArray(perOrder) || perOrder.length === 0) {
        return bad("This audit entry has no per-order before-state (older log) - cannot rollback", 400);
      }
      for (const o of perOrder) {
        await prisma.order.update({ where: { id: Number(o.id) }, data: { orderStatus: String(o.orderStatus) } }).catch(() => {});
        await prisma.orderHistory.create({ data: { orderId: Number(o.id), status: String(o.orderStatus), remark: "Rollback of audit #" + auditId, addedById: g.user.id } }).catch(() => {});
        affected++;
      }
      restoredNote.push(affected + " orders restored to previous status");
    }

    // ─── user.update: restore role/permissions/name/isActive ────────────────
    else if (entry.action === "user.update") {
      const before = d?.before;
      if (!before || typeof before !== "object" || Object.keys(before).length === 0) {
        return bad("This audit entry has no before-state snapshot (older log) - cannot rollback", 400);
      }
      const userId = Number(entry.entityId);
      if (!userId) return bad("Invalid user id in audit entry");
      const restore: any = {};
      for (const [k, v] of Object.entries(before)) {
        if (k === "passwordHash" || k === "mustChangePw") continue;
        restore[k] = v;
      }
      // Safety: never deactivate the only active super admin via rollback
      if (restore.isActive === false) {
        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (target?.role === "SUPER_ADMIN") {
          const n = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
          if (n <= 1) return bad("Rollback would deactivate the only active Super Admin - blocked", 400);
        }
      }
      await prisma.user.update({ where: { id: userId }, data: restore });
      affected = 1;
      restoredNote.push("user fields: " + Object.keys(restore).join(", "));
    }

  } catch (e: any) {
    return bad("Rollback failed: " + String(e?.message ?? e).slice(0, 200), 500);
  }

  // ── Full chain rollback: also revert later dependent entries ────────────
  let chainAffected = 0;
  const chainNotes: string[] = [];
  if (chainMode === "full_chain") {
    // Find later entries overlapping same order IDs
    const affectedIds = (entry.entityId ?? "").split(",").map((x) => Number(x.trim())).filter((n) => n > 0 && n < 1e9);
    const affectedSet = new Set(affectedIds);
    const laterEntries = await prisma.auditLog.findMany({
      where: { id: { gt: auditId }, entityType: "order", action: { not: { startsWith: "rollback." } } },
      orderBy: { id: "desc" }, // newest first — undo in reverse order
      take: 200,
    });
    const toUndo: typeof laterEntries = [];
    for (const le of laterEntries) {
      const eIds = (le.entityId ?? "").split(",").map((x) => Number(x.trim())).filter((n) => n > 0);
      if (eIds.some((id) => affectedSet.has(id)) && ROLLBACKABLE.has(le.action)) toUndo.push(le);
    }
    for (const le of toUndo) {
      const ld: any = typeof le.details === "string" ? (() => { try { return JSON.parse(le.details); } catch { return {}; } })() : (le.details || {});
      if (le.action === "order.bulkAssign" || le.action === "order.update") {
        const po: any[] = ld?.before?.perOrder ?? [];
        if (po.length > 0) {
          for (const o of po) {
            const restore: any = { leadOwnerId: o.leadOwnerId ?? null, agentAssignDate: o.agentAssignDate ? new Date(o.agentAssignDate) : null };
            await prisma.order.update({ where: { id: Number(o.id) }, data: restore }).catch(() => {});
            chainAffected++;
          }
          chainNotes.push("chain #" + le.id + " undone (" + po.length + " orders)");
        }
      } else if (le.action === "order.bulkStatus") {
        const po: any[] = ld?.before?.perOrder ?? [];
        for (const o of po) {
          await prisma.order.update({ where: { id: Number(o.id) }, data: { orderStatus: String(o.orderStatus) } }).catch(() => {});
          chainAffected++;
        }
        chainNotes.push("chain #" + le.id + " status undone");
      }
    }
  }
  const totalAffected = affected + chainAffected;
  const finalNote = [restoredNote.join("; "), ...chainNotes].filter(Boolean).join(" | ");

  // Audit trail for the rollback itself
  await audit(g.user.id, "rollback.executed", entry.entityType ?? undefined, entry.entityId ?? undefined, {
    sourceAuditId: auditId,
    sourceAction: entry.action,
    sourceUser: entry.user?.name ?? null,
    affected: totalAffected,
    chainMode,
    note: finalNote,
  });

  return ok({ success: true, affected: totalAffected, sourceAction: entry.action, note: finalNote });
}