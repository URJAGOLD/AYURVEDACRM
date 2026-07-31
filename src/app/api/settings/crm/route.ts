import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok, bad, audit } from "@/lib/apiHelpers";
import { isSuperAdmin } from "@/lib/permissions";
import {
  getCrmSettings, DEFAULT_PREFERENCES, DEFAULT_FOLLOWUP,
  PREF_KEY, FOLLOWUP_KEY, type CrmPreferences, type FollowupRules,
  STATUSES_KEY, CORE_STATUS_NAMES, type StatusItem,
} from "@/lib/settings";

export const runtime = "nodejs";

// READ: any authenticated user with orders.view (client badges/thresholds need this).
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  const s = await getCrmSettings();
  return ok({ ...s, defaults: { preferences: DEFAULT_PREFERENCES, followup: DEFAULT_FOLLOWUP } });
}

// WRITE: SUPER_ADMIN only. Validates, upserts, audits. Partial update allowed.
export async function PUT(req: NextRequest) {
  const g = requirePermission(req, "orders.view");
  if (g instanceof Response) return g;
  if (!isSuperAdmin(g.user)) return bad("Sirf SUPER_ADMIN settings badal sakta hai", 403);
  const b = await req.json().catch(() => ({}));
  const out: any = {};

  if (b.preferences && typeof b.preferences === "object") {
    const p = b.preferences as Partial<CrmPreferences>;
    const num = (v: any, d: number, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : d; };
    const pref: CrmPreferences = {
      highValueThreshold: num(p.highValueThreshold, DEFAULT_PREFERENCES.highValueThreshold, 1),
      highValuePresets: Array.isArray(p.highValuePresets)
        ? p.highValuePresets.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).slice(0, 6)
        : DEFAULT_PREFERENCES.highValuePresets,
      vipMinOrders: num(p.vipMinOrders, DEFAULT_PREFERENCES.vipMinOrders, 1),
      vipMinSpent: num(p.vipMinSpent, DEFAULT_PREFERENCES.vipMinSpent, 1),
      repeatMinOrders: num(p.repeatMinOrders, DEFAULT_PREFERENCES.repeatMinOrders, 2),
      defaultQueue: (p.defaultQueue === "all" || p.defaultQueue === "action") ? p.defaultQueue : DEFAULT_PREFERENCES.defaultQueue,
      dashboardRefreshSec: num(p.dashboardRefreshSec, DEFAULT_PREFERENCES.dashboardRefreshSec, 5),
    };
    await prisma.setting.upsert({ where: { key: PREF_KEY }, create: { key: PREF_KEY, value: JSON.stringify(pref), updatedById: g.user.id }, update: { value: JSON.stringify(pref), updatedById: g.user.id } });
    out.preferences = pref;
  }

  if (b.followup && typeof b.followup === "object") {
    const f = b.followup as Partial<FollowupRules>;
    const strArr = (v: any, d: string[]) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : d;
    const fu: FollowupRules = {
      requiredStatuses: strArr(f.requiredStatuses, DEFAULT_FOLLOWUP.requiredStatuses),
      maxDaysByStatus: (f.maxDaysByStatus && typeof f.maxDaysByStatus === "object")
        ? Object.fromEntries(Object.entries(f.maxDaysByStatus).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]))
        : DEFAULT_FOLLOWUP.maxDaysByStatus,
      unlimitedStatuses: strArr(f.unlimitedStatuses, DEFAULT_FOLLOWUP.unlimitedStatuses),
      optionalStatuses: strArr(f.optionalStatuses, DEFAULT_FOLLOWUP.optionalStatuses),
    };
    await prisma.setting.upsert({ where: { key: FOLLOWUP_KEY }, create: { key: FOLLOWUP_KEY, value: JSON.stringify(fu), updatedById: g.user.id }, update: { value: JSON.stringify(fu), updatedById: g.user.id } });
    out.followup = fu;
  }

  // Phase 2B-2: order-status config. Core names are LOCKED (rename/delete blocked server-side);
  // Add/Color/Reorder/Enable-Disable allowed. "New" can never be disabled.
  if (Array.isArray(b.statuses)) {
    const seen = new Set<string>();
    const list: StatusItem[] = [];
    for (const x of b.statuses) {
      if (!x || typeof x.name !== "string") continue;
      const name = x.name.trim().slice(0, 40);
      if (!name) continue;
      const lc = name.toLowerCase();
      if (seen.has(lc)) return bad("Duplicate status name: " + name);
      seen.add(lc);
      list.push({
        name,
        color: typeof x.color === "string" && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : "#94a3b8",
        enabled: x.enabled !== false,
        core: CORE_STATUS_NAMES.includes(name),
      });
    }
    if (list.length === 0) return bad("Statuses list khali nahi ho sakti");
    if (list.length > 60) return bad("Maximum 60 statuses allowed");
    const missing = CORE_STATUS_NAMES.filter((n) => !list.some((s) => s.name === n));
    if (missing.length) return bad("Core status rename/delete locked hai. Missing: " + missing.join(", "));
    const nw = list.find((s) => s.name === "New"); if (nw) nw.enabled = true;
    if (!list.some((s) => s.enabled)) return bad("Kam se kam ek status enabled rakhein");
    await prisma.setting.upsert({ where: { key: STATUSES_KEY }, create: { key: STATUSES_KEY, value: JSON.stringify(list), updatedById: g.user.id }, update: { value: JSON.stringify(list), updatedById: g.user.id } });
    out.statuses = list;
  }

  if (!out.preferences && !out.followup && !out.statuses) return bad("Kuch update nahi mila (preferences/followup/statuses bhejein)");
  await audit(g.user.id, "settings.update", "setting", Object.keys(out).join(","), out);
  return ok(out);
}
