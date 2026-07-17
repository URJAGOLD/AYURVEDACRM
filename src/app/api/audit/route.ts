import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBound(v: string | null, endOfDay: boolean): Date | undefined {
  if (!v) return undefined;
  if (v.includes("T")) { const d = new Date(v); return isNaN(d.getTime()) ? undefined : d; }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) { const d = new Date(v); return isNaN(d.getTime()) ? undefined : d; }
  const istMs = Date.UTC(+m[1], +m[2] - 1, +m[3], endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return new Date(istMs - 5.5 * 3600000);
}

function lensClause(lens: string | null): any | undefined {
  switch (lens) {
    case "security": return { OR: [{ action: { startsWith: "auth." } }, { action: { startsWith: "user." } }] };
    case "data": return { OR: ["create", "update", "delete", "bulk", "import", "add"].map((k) => ({ action: { contains: k } })) };
    case "shipping": return { action: { startsWith: "shiprocket." } };
    default: return undefined;
  }
}

function buildWhere(sp: URLSearchParams): any {
  const where: any = {};
  const and: any[] = [];
  const from = parseBound(sp.get("from"), false);
  const to = parseBound(sp.get("to"), true);
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const userId = sp.get("userId");
  if (userId && /^\d+$/.test(userId)) where.userId = Number(userId);
  const entityType = sp.get("entityType");
  if (entityType) where.entityType = entityType;
  const action = sp.get("action");
  if (action) where.action = action;
  else { const lc = lensClause(sp.get("lens")); if (lc) and.push(lc); }
  const q = (sp.get("q") || "").trim();
  if (q) and.push({ OR: [{ action: { contains: q, mode: "insensitive" } }, { entityId: { contains: q } }, { entityType: { contains: q, mode: "insensitive" } }] });
  if (and.length) where.AND = and;
  return where;
}

function fmtIST(d: Date): string {
  return new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function csvCell(v: any): string {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export async function GET(req: NextRequest) {
  const g = requirePermission(req, "users.manage");
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const where = buildWhere(sp);

  if (sp.get("format") === "csv") {
    const rows = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5000, include: { user: { select: { name: true, role: true, email: true } } } });
    const header = ["Time (IST)", "User", "Role", "Email", "Action", "EntityType", "EntityId", "Details"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows as any[]) {
      lines.push([fmtIST(r.createdAt), r.user?.name ?? (r.userId ? "#" + r.userId : "System"), r.user?.role ?? "", r.user?.email ?? "", r.action, r.entityType ?? "", r.entityId ?? "", r.details ?? ""].map(csvCell).join(","));
    }
    return new Response("\uFEFF" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=audit-logs.csv" } });
  }

  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") || 50)));
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { name: true, role: true, email: true } } } }),
  ]);
  return ok({ rows, total, page, pageSize, pages: Math.ceil(total / pageSize) });
}