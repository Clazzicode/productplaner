import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { aiAssistContentTriggerSchema } from "@/lib/validation/schemas";
import { runProposeStoryContent } from "@/lib/ai/actions/proposeStoryContent";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";

// AI Assist trigger — PROPOSE_STORY_CONTENT (Section 4). Body: { featureId }.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = aiAssistContentTriggerSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  // The feature id is client-supplied — confirm it actually belongs to this
  // (already access-checked) initiative before reasoning about it, never
  // trust it alone (Section 4's project/initiative isolation requirement).
  const feature = await db.artifactLayer.findUnique({
    where: { id: parsed.data.featureId },
    select: { type: true, prototype: { select: { initiativeId: true } } },
  });
  if (!feature || feature.type !== "feature" || feature.prototype.initiativeId !== id) {
    return jsonError("Feature not found on this initiative.", 404);
  }

  try {
    const result = await runProposeStoryContent({
      featureArtifactLayerId: parsed.data.featureId,
      userId: user.id,
      organizationId: user.organizationId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapAssistActionError(err);
  }
}

export const POST = withApi(POSTHandler);
