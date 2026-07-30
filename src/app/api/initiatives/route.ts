import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { initiativeCreateSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const parsed = initiativeCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const user = await getCurrentUser();
  const profile = await getActiveProfile();
  if (!profile) {
    return jsonError("Complete the qualifying questions before creating an initiative.", 403);
  }

  const initiative = await db.initiative.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      qualifyingProfileId: profile.id,
      name: parsed.data.name,
      description: parsed.data.description,
      status: "intake_in_progress",
      intakeAnswerSet: { create: {} },
    },
  });
  return NextResponse.json({ initiativeId: initiative.id });
}
