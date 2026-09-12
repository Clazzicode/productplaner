import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { snapshotApprovedBaseline } from "@/lib/generation/locking";

// Versioning foundation (directive §17/§25). The full FR-11/12/13 per-layer
// lock ceremony stays disabled platform-wide (a deliberate product decision —
// see resolveLifecycleState.ts), but "approved" still needs to mean
// something: this is the lightweight replacement — a direct, explicit
// approve action, reusing the same snapshotApprovedBaseline() the old lock
// ceremony used to call only after all five layers were locked. Once set,
// recalculatePlan() refuses to silently rebuild the plan (ApprovedBaselineImpactError).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const prototype = await db.prototype.findUnique({ where: { initiativeId: id }, select: { id: true } });
  if (!prototype) return jsonError("Generate a plan before approving it.", 404);

  await snapshotApprovedBaseline(prototype.id);
  return NextResponse.json({ ok: true });
}
