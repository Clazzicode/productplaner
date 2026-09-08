import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const teamCreateSchema = z.object({
  name: z.string().trim().min(1, "Team name is required.").max(80),
  description: z.string().trim().max(280).optional(),
});

/** Flat teams only — no nesting, no team roles (docs/V2-ACCESS-TEAMS-VISIBILITY.md §3). */
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can create teams.", 403);

  const parsed = teamCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const team = await db.team.create({
    data: {
      organizationId: actor.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
    },
  });
  return NextResponse.json(team, { status: 201 });
}
