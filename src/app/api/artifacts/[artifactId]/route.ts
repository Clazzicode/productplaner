import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { assertArtifactEditable, LockedLayerError } from "@/lib/generation/locking";
import type { ArtifactType } from "@/lib/generation/types";
import { artifactPatchSchema } from "@/lib/validation/schemas";
import { BusinessError } from "@/lib/businessError";
import { storyReadiness } from "@/lib/stories/service";

async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await params;
  const parsed = artifactPatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const artifact = await db.artifactLayer.findUnique({
    where: { id: artifactId },
    include: { prototype: { select: { initiativeId: true } } },
  });
  if (!artifact) return jsonError("Artifact not found.", 404);

  const guard = await requireInitiativeApiAccess(authGuard.user, artifact.prototype.initiativeId, "edit");
  if (!guard.ok) return guard.response;
  if (artifact.type === "story") return jsonError("Use the story workflow to edit stories so history and concurrency checks are preserved.", 409);\n  if (artifact.type === "acceptance_criterion") return jsonError("Use the acceptance-criteria workflow so approval history and concurrency checks are preserved.", 409);

  try {
    await assertArtifactEditable(artifact.prototypeId, artifact.type as ArtifactType);
  } catch (err) {
    if (err instanceof LockedLayerError) return jsonError(err.message, 409);
    throw err;
  }

  await withPlanningMutation(artifact.prototype.initiativeId, "artifact.updated", async () => {
    await assertArtifactEditable(artifact.prototypeId, artifact.type as ArtifactType);
    const { changeReason, ...changes } = parsed.data;
    if (artifact.type === "story" && changes.readinessStatus === "sprint_ready") {
      const criteria = await db.artifactLayer.findMany({
        where: { parentId: artifactId, type: "acceptance_criterion" },
        select: { body: true },
      });
      const readiness = storyReadiness({
        title: changes.title ?? artifact.title,
        body: changes.body ?? artifact.body,
        points: changes.points === undefined ? artifact.points : changes.points,
        readinessStatus: changes.readinessStatus,
        criteria,
      });
      if (!readiness.ready) {
        throw new BusinessError(`This story is not sprint-ready: ${readiness.gaps.join(" ")}`, 422);
      }
    }
    if (artifact.type === "acceptance_criterion" && artifact.approvedAt && (changes.title !== undefined || changes.body !== undefined)) {
      if (!changeReason) throw new BusinessError("Explain why the approved acceptance criterion is changing.", 422);
      const version = await db.artifactRevision.count({ where: { artifactId } }) + 1;
      await db.artifactRevision.create({ data: { artifactId, version, title: artifact.title, body: artifact.body, reason: changeReason, actorUserId: authGuard.user.id } });
      await db.artifactLayer.update({ where: { id: artifactId }, data: { ...changes, approvedAt: null, approvedByUserId: null } });
    } else {
      await db.artifactLayer.update({ where: { id: artifactId }, data: changes });
    }
  }, true);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApi(PATCHHandler);
