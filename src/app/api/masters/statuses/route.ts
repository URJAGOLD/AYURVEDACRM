import { NextRequest } from "next/server";
import { requireAuth, ok } from "@/lib/apiHelpers";
import { PAYMENT_STATUSES } from "@/lib/statuses";
import { getStatusConfig } from "@/lib/settings";
export const runtime = "nodejs";

// Phase 2B-2: statuses now come from Setting("crm.statuses") with code fallback.
// Default behaviour = identical to the old hardcoded ORDER_STATUSES list.
//   statuses : enabled status names in display order (used by all dropdowns/filters)
//   full     : complete config [{name,color,enabled,core}] for the Settings editor
//   colors   : name -> hex map (single source of truth for status colors)
export async function GET(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  const cfg = await getStatusConfig();
  const statuses = cfg.filter((s) => s.enabled).map((s) => s.name);
  const colors: Record<string, string> = {};
  for (const s of cfg) colors[s.name] = s.color;
  return ok({ statuses, paymentStatuses: PAYMENT_STATUSES, full: cfg, colors });
}
