import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getResolvedStatus, setRoadmapStatus } from "@/lib/roadmapStatus/service";
import { roadmapStatusEntityTypeSchema, roadmapStatusSetSchema } from "@/lib/validation/schemas";

// Writes are scoped to the two entity types this pass actually wires a UI
// for (initiative/project) — feature/epic/story/sprint/release have no
// organizationId resolution path built yet (they'd need to walk
// ArtifactLayer -> Prototype -> Initiative), so they're read-only via the
// batch GET until that's added alongside their own UI.
export async function PATCH(request: Request, { params }: { params: Promise<{ entityType: string; entityId: string }> }) {
  const { entityType, entityId } = await params;
  const entityTypeParsed = roadmapStatusEntityTypeSchema.safeParse(entityType);
  if (!entityTypeParsed.success) return jsonError("Invalid entityType.", 422);
  if (entityTypeParsed.data !== "initiative" && entityTypeParsed.data !== "project") {
    return jsonError("Setting status for this entity type isn't supported yet.", 400);
  }

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  if (entityTypeParsed.data === "initiative") {
    const guard = await requireInitiativeApiAccess(user, entityId, "edit");
    if (!guard.ok) return guard.response;
  } else {
    const guard = await requireProjectApiAccess(user, entityId);
    if (!guard.ok) return guard.response;
  }

  const parsed = roadmapStatusSetSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  // "source: system" is only honest when it matches the live recommendation
  // this server would currently compute — never trust the client's word for
  // it (a stale or fabricated "Accept" must not masquerade as a real one).
  let source = parsed.data.source;
  if (source === "system") {
    const current = await getResolvedStatus(user.organizationId, entityTypeParsed.data, entityId);
    if (!current.recommendation || current.recommendation.color !== parsed.data.color) {
      source = "manual";
    }
  }

  await setRoadmapStatus({
    organizationId: user.organizationId,
    entityType: entityTypeParsed.data,
    entityId,
    color: parsed.data.color,
    reason: parsed.data.reason,
    source,
    updatedByUserId: user.id,
  });
  return NextResponse.json({ ok: true });
}
