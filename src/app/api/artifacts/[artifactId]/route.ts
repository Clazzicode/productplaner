import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { assertArtifactEditable, LockedLayerError } from "@/lib/generation/locking";
import type { ArtifactType } from "@/lib/generation/types";
import { artifactPatchSchema } from "@/lib/validation/schemas";

export async function PATCH(
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

  try {
    await assertArtifactEditable(artifact.prototypeId, artifact.type as ArtifactType);
  } catch (err) {
    if (err instanceof LockedLayerError) return jsonError(err.message, 409);
    throw err;
  }

  await db.artifactLayer.update({ where: { id: artifactId }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
