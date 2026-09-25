import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { demoIntegrationsEnabled } from "@/lib/sync/demoPolicy";
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
async function POSTHandler() {
  if (!demoIntegrationsEnabled()) return NextResponse.json({ error: "Demo reset is disabled." }, { status: 403 });
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  await withTransaction((tx) =>
    Promise.all([
      tx.initiative.deleteMany({ where: { userId: user.id, organizationId: user.organizationId } }),
      tx.qualifyingProfile.deleteMany({ where: { userId: user.id } }),
    ]),
  );
  return NextResponse.json({ ok: true });
}

export const POST = withApi(POSTHandler);
