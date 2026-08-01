import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Full demo reset. Initiatives must be deleted before qualifying profiles —
 * `Initiative.qualifyingProfileId` is an FK to `QualifyingProfile` with no
 * cascade, so profiles can't be removed first. Everything under each
 * initiative (IntakeAnswerSet, Capability, Prototype→ArtifactLayer/Sprint/
 * Release/LayerLock, SyncConnection, IntegrationConnection) cascades
 * automatically. Org-wide IntegrationConnections and the demo-mode
 * preference are deliberately left untouched — they aren't per-initiative
 * journey state.
 */
export async function POST() {
  const user = await getCurrentUser();
  await db.$transaction([
    db.initiative.deleteMany({ where: { userId: user.id } }),
    db.qualifyingProfile.deleteMany({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
