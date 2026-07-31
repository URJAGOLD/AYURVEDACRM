import { prisma } from "@/lib/prisma";

// Phase 4-A: clean status-change activity logger.
// Fire-and-forget: ANY failure is swallowed (logged to console) so it can NEVER
// break the order update / bulk update / webhook flow it is called from.
// Records ONLY real transitions (skips no-op where previousStatus === newStatus).

export type StatusActivityInput = {
  orderId: number;
  previousStatus?: string | null;
  newStatus: string;
  source: "manual" | "bulk" | "webhook";
  changedById?: number | null; // null = system/webhook
  leadOwnerId?: number | null;
  dealerId?: number | null;
};

function norm(a: StatusActivityInput) {
  return {
    orderId: a.orderId,
    previousStatus: a.previousStatus ?? null,
    newStatus: a.newStatus,
    source: a.source,
    changedById: a.changedById ?? null,
    leadOwnerId: a.leadOwnerId ?? null,
    dealerId: a.dealerId ?? null,
  };
}

export async function logStatusActivity(a: StatusActivityInput): Promise<void> {
  try {
    if (!a.newStatus) return;
    if (a.previousStatus != null && a.previousStatus === a.newStatus) return; // no real change
    await prisma.orderStatusActivity.create({ data: norm(a) });
  } catch (e) {
    console.error("[statusActivity] log failed:", (e as Error).message);
  }
}

export async function logStatusActivityBulk(rows: StatusActivityInput[]): Promise<void> {
  try {
    const data = rows
      .filter((r) => r.newStatus && !(r.previousStatus != null && r.previousStatus === r.newStatus))
      .map(norm);
    if (data.length) await prisma.orderStatusActivity.createMany({ data });
  } catch (e) {
    console.error("[statusActivity] bulk log failed:", (e as Error).message);
  }
}
