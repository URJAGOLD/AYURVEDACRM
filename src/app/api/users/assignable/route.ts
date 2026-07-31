import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// Lightweight list of users that can be set as Lead Owner.
// Gated by orders.assignAgent so MANAGER/SUPER_ADMIN can populate the
// assign dropdown WITHOUT needing the heavier users.manage permission.
export async function GET(req: NextRequest) {
  const g = requirePermission(req, "orders.assignAgent");
  if (g instanceof Response) return g;
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return ok({ users });
}