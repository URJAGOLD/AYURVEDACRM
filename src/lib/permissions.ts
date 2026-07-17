/**
 * ============================================================
 *  RBAC - Role & Permission catalog (multi-user access core)
 * ============================================================
 * One SUPER_ADMIN seeds the system and creates all other users.
 * For each user the super admin picks a ROLE (sets default permissions) and can
 * then toggle individual permissions ON/OFF (stored in User.permissions JSON).
 *
 * A permission key is "module.action". This catalog is the single source of truth:
 * the "Users & Access" screen renders checkboxes from it, and every API route
 * enforces it via requirePermission().
 *
 * DATA SCOPING:
 *   orders.view    -> can open Orders module
 *   orders.viewAll -> sees EVERY agent's orders. WITHOUT it, the user sees ONLY
 *                     orders where leadOwnerId = their own id (telecaller view).
 */
export type PermissionKey = string;
export interface PermissionDef { key: PermissionKey; label: string; }
export interface PermissionModule { module: string; label: string; permissions: PermissionDef[]; }

export const PERMISSION_CATALOG: PermissionModule[] = [
  { module: "orders", label: "Orders (Manage Orders)", permissions: [
    { key: "orders.view", label: "View Orders module" },
    { key: "orders.viewAll", label: "See ALL agents orders (not just own)" },
    { key: "orders.create", label: "Create order" },
    { key: "orders.edit", label: "Edit order" },
    { key: "orders.delete", label: "Delete order" },
    { key: "orders.export", label: "Export to Excel" },
    { key: "orders.import", label: "Bulk import (Excel upload)" },
    { key: "orders.assignAgent", label: "Assign / change Lead Owner" },
    { key: "orders.assignDealer", label: "Assign / change Dealer" },
    { key: "orders.changeStatus", label: "Change order status" },
  ]},
  { module: "shiprocket", label: "Shiprocket Shipping", permissions: [
    { key: "shiprocket.book", label: "Book order on Shiprocket (create + AWB)" },
    { key: "shiprocket.pickup", label: "Request pickup" },
    { key: "shiprocket.track", label: "Track shipment" },
    { key: "shiprocket.label", label: "Generate label / manifest" },
    { key: "shiprocket.cancel", label: "Cancel shipment" },
  ]},
  { module: "masters", label: "Masters (Sources, Dealers, States)", permissions: [
    { key: "masters.view", label: "View masters" },
    { key: "masters.manage", label: "Add / edit masters" },
  ]},
  { module: "users", label: "Users & Access", permissions: [
    { key: "users.manage", label: "Create users & assign access (admin)" },
  ]},
  { module: "reports", label: "Reports & Analytics", permissions: [
    { key: "reports.view", label: "View reports / analytics" },
  ]},
];

export const ALL_PERMISSION_KEYS: PermissionKey[] =
  PERMISSION_CATALOG.flatMap(m => m.permissions.map(p => p.key));

export type RoleName = "SUPER_ADMIN" | "MANAGER" | "AGENT" | "VIEWER" | "DEALER";

export const ROLE_PRESETS: Record<RoleName, PermissionKey[]> = {
  SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
  MANAGER: [
    "orders.view","orders.viewAll","orders.create","orders.edit","orders.export","orders.import",
    "orders.assignAgent","orders.assignDealer","orders.changeStatus",
    "shiprocket.book","shiprocket.pickup","shiprocket.track","shiprocket.label","shiprocket.cancel",
    "masters.view","masters.manage","reports.view",
  ],
  AGENT: ["orders.view","orders.edit","orders.changeStatus","shiprocket.track","masters.view"],
  VIEWER: ["orders.view","orders.viewAll","reports.view","masters.view"],
  DEALER: ["orders.view","orders.edit","orders.changeStatus","shiprocket.track"],
};

export function defaultPermissionsForRole(role: RoleName): Record<string, boolean> {
  const granted = new Set(ROLE_PRESETS[role] ?? []);
  const map: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) map[key] = granted.has(key);
  return map;
}

export interface AuthUser {
  id: number; name: string; email: string; role: RoleName; permissions: Record<string, boolean>; dealerId?: number | null;
}

/** Central permission check. SUPER_ADMIN always passes. */
export function can(user: AuthUser | null | undefined, permission: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.permissions?.[permission] === true;
}

/**
 * Phase 1 hard role gate for ASSIGNMENT actions
 * (Assign / Reassign / change Lead Owner / change Dealer).
 * Only SUPER_ADMIN and MANAGER ("Admin") qualify. This is intentionally
 * role-based — NOT a toggleable permission — so a normal AGENT / VIEWER /
 * Dealer can NEVER assign, even if an assign permission flag is left ON.
 */
export function canAssign(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === "SUPER_ADMIN" || user.role === "MANAGER";
}

/** Phase 2A: Settings (CRM Control Center) is restricted to SUPER_ADMIN only. */
export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && user.role === "SUPER_ADMIN";
}

/** Phase 4 Dealer System: statuses a DEALER login may set (easy to adjust). */
export const DEALER_ALLOWED_STATUSES = ["GPO Pending","GPO Done","GPO Delivered","Dispatched","Delivered","Dealer Cancel"];

/**
 * Central data-scope filter for order queries.
 * - viewAll users  -> {} (no scope)
 * - DEALER login   -> { dealerId } (only orders assigned to their dealer)
 * - everyone else  -> { leadOwnerId: user.id } (telecaller view)
 */
export function scopeFilter(user: AuthUser): Record<string, any> {
  if (can(user, "orders.viewAll")) return {};
  if (user.role === "DEALER") return { dealerId: user.dealerId ?? -1 };
  return { leadOwnerId: user.id };
}
