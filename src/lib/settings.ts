import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PREFERENCES, DEFAULT_FOLLOWUP, PREF_KEY, FOLLOWUP_KEY, type CrmSettings,
  DEFAULT_STATUSES, CORE_STATUS_NAMES, STATUSES_KEY, type StatusItem,
} from "@/lib/crmDefaults";

// Re-export client-safe defaults & types so existing importers of "@/lib/settings" keep working.
export * from "@/lib/crmDefaults";

// DB over defaults (shallow merge). Never throws: on any error returns defaults.
export async function getCrmSettings(): Promise<CrmSettings> {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: [PREF_KEY, FOLLOWUP_KEY] } } });
    const m: Record<string, any> = {};
    for (const r of rows) { try { m[r.key] = JSON.parse(r.value); } catch { m[r.key] = {}; } }
    return {
      preferences: { ...DEFAULT_PREFERENCES, ...(m[PREF_KEY] || {}) },
      followup: { ...DEFAULT_FOLLOWUP, ...(m[FOLLOWUP_KEY] || {}) },
    };
  } catch (e) {
    console.error("[settings] fallback to defaults:", (e as Error).message);
    return { preferences: DEFAULT_PREFERENCES, followup: DEFAULT_FOLLOWUP };
  }
}

// Phase 2B-2: status config. DB over defaults. Guarantees:
//   - never throws (any error => DEFAULT_STATUSES)
//   - all 19 core statuses always present (self-heal if a row is corrupt)
//   - "New" can never be disabled (ingest creates orders as "New")
export async function getStatusConfig(): Promise<StatusItem[]> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: STATUSES_KEY } });
    const v = row?.value ? (() => { try { return JSON.parse(row.value); } catch { return null; } })() : null;
    if (!Array.isArray(v) || v.length === 0) return DEFAULT_STATUSES;
    const seen = new Set<string>();
    const list: StatusItem[] = [];
    for (const x of v) {
      if (!x || typeof x.name !== "string") continue;
      const name = x.name.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      list.push({
        name,
        color: typeof x.color === "string" && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : "#94a3b8",
        enabled: x.enabled !== false,
        core: CORE_STATUS_NAMES.includes(name),
      });
    }
    for (const d of DEFAULT_STATUSES) if (!seen.has(d.name.toLowerCase())) list.push({ ...d });
    const nw = list.find((s) => s.name === "New"); if (nw) nw.enabled = true;
    return list.length ? list : DEFAULT_STATUSES;
  } catch (e) {
    console.error("[settings] statuses fallback to defaults:", (e as Error).message);
    return DEFAULT_STATUSES;
  }
}