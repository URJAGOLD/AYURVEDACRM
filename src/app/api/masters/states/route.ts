import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok } from "@/lib/apiHelpers";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const g = requireAuth(req); if (g instanceof Response) return g;
  const states = await prisma.state.findMany({ orderBy: { name: "asc" } });
  return ok({ states });
}