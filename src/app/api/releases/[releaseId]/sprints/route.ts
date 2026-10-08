import { createManualSprint } from "@/lib/generation/manualScheduling";
import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { createSprintSchema } from "@/lib/validation/schemas";

/**
 * Guided-activation restructure (reference doc §8/§9): the explicit
 * "Plan Sprint" step. Deliberately scoped to `origin:"manual"` releases only
 * — sprints are always planned under a release the user has already
 * confirmed, keeping the manual chain (Release -> Sprint) separate from
 * whatever the engine's auto-repack is doing for other, unclaimed phases.
 */
async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  const { releaseId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      origin: true,
      phaseNumber: true,
      prototype: { select: { id: true, initiativeId: true } },
    },
  });
  if (!release) return jsonError("Not found.", 404);

  const guard = await requireInitiativeApiAccess(authGuard.user, release.prototype.initiativeId, "edit");
  if (!guard.ok) return guard.response;

  if (release.origin !== "manual") {
    return jsonError("Sprints can only be planned under a manually created release.", 409);
  }

  const parsed = createSprintSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const result = await createManualSprint(release.prototype.initiativeId, releaseId, parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

export const POST = withApi(POSTHandler);
