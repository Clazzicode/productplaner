import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { createSprintSchema } from "@/lib/validation/schemas";

/**
 * Guided-activation restructure (reference doc §8/§9): the explicit
 * "Plan Sprint" step. Deliberately scoped to `origin:"manual"` releases only
 * — sprints are always planned under a release the user has already
 * confirmed, keeping the manual chain (Release -> Sprint) separate from
 * whatever the engine's auto-repack is doing for other, unclaimed phases.
 */
export async function POST(
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
  const { startDate, endDate, capacityPoints, storyIds } = parsed.data;

  const prototypeId = release.prototype.id;

  // Only stories under THIS release's own claimed phase, still unassigned,
  // may be picked — validated server-side, not trusted from the request.
  let validStoryIds: string[] = [];
  if (storyIds.length > 0) {
    const candidates = await db.artifactLayer.findMany({
      where: { id: { in: storyIds }, prototypeId, type: "story", sprintId: null },
      select: {
        id: true,
        parent: { select: { parent: { select: { parent: { select: { contentJson: true } } } } } },
      },
    });
    validStoryIds = candidates
      .filter((s) => {
        const raw = s.parent?.parent?.parent?.contentJson ?? "{}";
        try {
          return (JSON.parse(raw) as { phaseNumber?: number }).phaseNumber === release.phaseNumber;
        } catch {
          return false;
        }
      })
      .map((s) => s.id);
  }

  const sprint = await withTransaction(async (tx) => {
    const maxSprintNumber = await tx.sprint.aggregate({
      where: { prototypeId },
      _max: { sprintNumber: true },
    });
    const created = await tx.sprint.create({
      data: {
        prototypeId,
        sprintNumber: (maxSprintNumber._max.sprintNumber ?? 0) + 1,
        phaseNumber: release.phaseNumber,
        startDate,
        endDate,
        capacityPoints,
        origin: "manual",
        releaseId: release.id,
      },
    });
    if (validStoryIds.length > 0) {
      await tx.artifactLayer.updateMany({
        where: { id: { in: validStoryIds } },
        data: { sprintId: created.id },
      });
    }
    return created;
  });

  return NextResponse.json({ ok: true, sprint, assignedStoryCount: validStoryIds.length });
}
