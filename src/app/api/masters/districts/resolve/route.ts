import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ok, bad } from "@/lib/apiHelpers";

export const runtime = "nodejs";

// Finds an existing district (case-insensitive) under the given state, or creates
// one on the fly if the agent typed a name that isn't in the master list yet.
// This unblocks order entry for districts that were never in the small seeded sample.
export async function POST(req: NextRequest) {
  const g = requireAuth(req);
  if (g instanceof Response) return g;

  const body = await req.json().catch(() => ({}));
  const stateId = Number(body?.stateId);
  const name = String(body?.name || "").trim();
  if (!stateId) return bad("stateId is required");
  if (!name) return bad("District name is required");

  const existing = await prisma.district.findFirst({
    where: { stateId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return ok({ district: existing, created: false });

  // District.id has no auto-increment default in this schema (original data used
  // real government district codes), so pick a safe new id with a couple of retries
  // in case two requests race for the same value.
  for (let attempt = 0; attempt < 3; attempt++) {
    const max = await prisma.district.aggregate({ _max: { id: true } });
    const nextId = (max._max.id ?? 0) + 1;
    try {
      const created = await prisma.district.create({
        data: { id: nextId, name, stateId },
      });
      return ok({ district: created, created: true });
    } catch (e: any) {
      if (e?.code === "P2002" && attempt < 2) continue; // id collision, retry
      return bad("Could not create district: " + (e?.message || "unknown error"));
    }
  }
  return bad("Could not create district after retries");
}
