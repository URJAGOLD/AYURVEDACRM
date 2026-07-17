// Client-safe CRM defaults & types (NO prisma import).
// Single source of truth: server (src/lib/settings.ts re-exports) + client fallback.
// Phase 2B-1 (.3): "Cancel pending" case-bug fixed - follow-up now applies
// to the real "Cancel pending" status.

export type CrmPreferences = {
  highValueThreshold: number;
  highValuePresets: number[];
  vipMinOrders: number;
  vipMinSpent: number;
  repeatMinOrders: number;
  defaultQueue: string;
  dashboardRefreshSec: number;
};

export type FollowupRules = {
  requiredStatuses: string[];
  maxDaysByStatus: Record<string, number>;
  unlimitedStatuses: string[];
  optionalStatuses: string[];
};

export type CrmSettings = { preferences: CrmPreferences; followup: FollowupRules };

export const PREF_KEY = "crm.preferences";
export const FOLLOWUP_KEY = "crm.followup";

export const DEFAULT_PREFERENCES: CrmPreferences = {
  highValueThreshold: 2000,
  highValuePresets: [2000, 3000, 5000],
  vipMinOrders: 3,
  vipMinSpent: 3000,
  repeatMinOrders: 2,
  defaultQueue: "action",
  dashboardRefreshSec: 60,
};

export const DEFAULT_FOLLOWUP: FollowupRules = {
  requiredStatuses: ["Callback", "Future Delivery", "Pending", "GPO Pending", "Cancel pending", "Confirm Pending"],
  maxDaysByStatus: { "Pending": 2, "GPO Pending": 2, "Cancel pending": 2 },
  unlimitedStatuses: ["Callback", "Future Delivery"],
  optionalStatuses: ["Confirm Pending"],
};

export const DEFAULT_CRM: CrmSettings = { preferences: DEFAULT_PREFERENCES, followup: DEFAULT_FOLLOWUP };

// ---- Phase 2B-2: Order Status config ----
// Add / Color / Reorder / Enable-Disable for all; RENAME allowed only on custom (non-core) statuses.
// Core status NAMES are locked: reports/revenue/bucket-maps + existing orders depend on them.
export type StatusItem = { name: string; color: string; enabled: boolean; core: boolean };
export const STATUSES_KEY = "crm.statuses";

export const DEFAULT_STATUSES: StatusItem[] = [
  { name: "New",             color: "#3b82f6", enabled: true, core: true },
  { name: "Confirm Pending", color: "#f59e0b", enabled: true, core: true },
  { name: "Confirmed",       color: "#16a34a", enabled: true, core: true },
  { name: "In Transit",      color: "#0891b2", enabled: true, core: true },
  { name: "Delivered",       color: "#15803d", enabled: true, core: true },
  { name: "Callback",        color: "#8b5cf6", enabled: true, core: true },
  { name: "Pending",         color: "#f59e0b", enabled: true, core: true },
  { name: "GPO",             color: "#6366f1", enabled: true, core: true },
  { name: "GPO Pending",     color: "#a16207", enabled: true, core: true },
  { name: "GPO Done",        color: "#16a34a", enabled: true, core: true },
  { name: "GPO Delivered",   color: "#15803d", enabled: true, core: true },
  { name: "Confirm cancel",  color: "#ef4444", enabled: true, core: true },
  { name: "Cancel pending",  color: "#f97316", enabled: true, core: true },
  { name: "Final cancel",    color: "#dc2626", enabled: true, core: true },
  { name: "Cancelled",       color: "#dc2626", enabled: true, core: true },
  { name: "Dealer Cancel",   color: "#b91c1c", enabled: true, core: true },
  { name: "Future Delivery", color: "#0ea5e9", enabled: true, core: true },
  { name: "UNA",             color: "#64748b", enabled: true, core: true },
  { name: "RTO",             color: "#e11d48", enabled: true, core: true },
];
export const CORE_STATUS_NAMES: string[] = DEFAULT_STATUSES.map((s) => s.name);