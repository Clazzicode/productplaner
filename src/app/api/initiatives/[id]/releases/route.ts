import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { RELEASE_NAMES } from "@/lib/generation/constants";
import { createReleaseSchema } from "@/lib/validation/schemas";

/**
 * Guided-activation restructure (reference doc §8/§9): the explicit,
 * user-confirmed "Create Release" step — distinct from and no longer a
 * byproduct of plan generation (see engine.ts's generatePrototype/
 * repackSprints). Gated only on a plan existing — the waterfall roadmap-lock
 * ceremony this used to also require has been removed platform-wide. See
 * resolveLifecycleState.ts.
 */
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = createReleaseSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { phaseNumber, name, targetDate } = parsed.data;

  const initiative = await db.initiative.findUnique({
    where: { id },
    include: {
      prototype: {
        include: {
          releases: { select: { phaseNumber: true, origin: true } },
        },
      },
    },
  });
  if (!initiative?.prototype) {
    return jsonError("Generate a plan before creating a release.", 409);
  }

  const manualReleases = initiative.prototype.releases.filter((r) => r.origin === "manual");
  if (manualReleases.some((r) => r.phaseNumber === phaseNumber)) {
    return jsonError("This phase already has a release — create a sprint under it instead.", 409);
  }

  const prototypeId = initiative.prototype.id;
  const phaseRows = await db.artifactLayer.findMany({
    where: { prototypeId, type: "roadmap_phase" },
    select: { contentJson: true },
  });
  const phaseExists = phaseRows.some((p) => {
    try {
      return (JSON.parse(p.contentJson) as { phaseNumber?: number }).phaseNumber === phaseNumber;
    } catch {
      return false;
    }
  });
  if (!phaseExists) return jsonError("That roadmap phase doesn't exist.", 400);

  const isFirstManualRelease = manualReleases.length === 0;

  const release = await withTransaction(async (tx) => {
    if (isFirstManualRelease) {
      // Retroactive gating (reference doc decision: pre-existing auto-created
      // releases/sprints never satisfy the new gates) means this prototype's
      // stale engine-auto-packed rows have been sitting unconfirmed — once the
      // user creates their first real release, clear them rather than leaving
      // confusing duplicate content behind.
      await tx.sprint.deleteMany({ where: { prototypeId, origin: "auto" } });
      await tx.release.deleteMany({ where: { prototypeId, origin: "auto" } });
    }
    const maxOrder = await tx.release.aggregate({ where: { prototypeId }, _max: { order: true } });
    return tx.release.create({
      data: {
        prototypeId,
        name: name?.trim() || RELEASE_NAMES[phaseNumber] || `Release ${phaseNumber}`,
        phaseNumber,
        targetDate,
        order: (maxOrder._max.order ?? 0) + 1,
        origin: "manual",
      },
    });
  });

  return NextResponse.json({ ok: true, release });
}

export const POST = withApi(POSTHandler);
