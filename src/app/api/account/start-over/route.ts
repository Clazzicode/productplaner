import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext, withTransaction } from "@/lib/db";

/**
 * Full demo reset. Initiatives must be deleted before qualifying profiles —
 * `Initiative.qualifyingProfileId` is an FK to `QualifyingProfile` with no
 * cascade, so profiles can't be removed first. Everything under each
 * initiative (IntakeAnswerSet, Capability, Prototype→ArtifactLayer/Sprint/
 * Release/LayerLock, SyncConnection, IntegrationConnection) cascades
 * automatically. Org-wide IntegrationConnections are deliberately left
 * untouched — they aren't per-initiative journey state.
 */
export async function POST() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  await withTransaction((tx) =>
    Promise.all([
      tx.initiative.deleteMany({ where: { userId: user.id } }),
      tx.qualifyingProfile.deleteMany({ where: { userId: user.id } }),
    ]),
  );
  return NextResponse.json({ ok: true });
}
