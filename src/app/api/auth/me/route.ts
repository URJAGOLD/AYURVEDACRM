import { NextRequest } from "next/server";
import { requireAuth, ok } from "@/lib/apiHelpers";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const g = requireAuth(req);
  if (g instanceof Response) return g;
  return ok({ user: g.user });
}