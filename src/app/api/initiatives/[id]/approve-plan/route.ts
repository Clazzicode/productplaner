import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { snapshotApprovedBaseline } from "@/lib/generation/locking";
import { recordApprovedRoadmapVersion } from "@/lib/generation/versioning";

// Versioning foundation (directive §17/§25). The full FR-11/12/13 per-layer
// lock ceremony stays disabled platform-wide (a deliberate product decision —
// see resolveLifecycleState.ts), but "approved" still needs to mean
// something: this is the lightweight replacement — a direct, explicit
// approve action, reusing the same snapshotApprovedBaseline() the old lock
// ceremony used to call only after all five layers were locked. Once set,
// recalculatePlan() refuses to silently rebuild the plan (ApprovedBaselineImpactError).
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const roleGuard = requireOrganizationRole(authGuard.user, ["owner", "admin"]);
  if (!roleGuard.ok) return roleGuard.response;
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  return withTransaction(async () => {
  const prototype = await db.prototype.findUnique({ where: { initiativeId: id }, select: { id: true } });
  if (!prototype) return jsonError("Generate a plan before approving it.", 404);

  await snapshotApprovedBaseline(prototype.id);
  const { versionNumber } = await recordApprovedRoadmapVersion({
    initiativeId: id,
    prototypeId: prototype.id,
    approvedByUserId: authGuard.user.id,
  });
  return NextResponse.json({ ok: true, versionNumber });
  }, { timeout: 120_000 });
}

export const POST = withApi(POSTHandler);
