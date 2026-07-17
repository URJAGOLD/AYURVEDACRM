import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/apiHelpers";
export const runtime = "nodejs";
// GET /api/masters/states/21/districts -> cascade dropdown
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  const districts = await prisma.district.findMany({ where: { stateId: Number(params.id) }, orderBy: { name: "asc" } });
  return ok({ districts });
}