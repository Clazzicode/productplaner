import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { aiAssistStatusTriggerSchema } from "@/lib/validation/schemas";
import { runRecommendStatus } from "@/lib/ai/actions/recommendStatus";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";

// AI Assist trigger — RECOMMEND_STATUS (Section 4). Body:
// { entityType: "project" | "initiative", entityId }. Scoped to this
// initiative or its own project only — never an arbitrary org-wide entity
// id, even though the caller is already access-checked for this initiative.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = aiAssistStatusTriggerSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { entityType, entityId } = parsed.data;

  if (entityType === "initiative" && entityId !== id) {
    return jsonError("entityId must be this initiative.", 400);
  }
  if (entityType === "project") {
    const initiative = await db.initiative.findUnique({ where: { id }, select: { projectId: true } });
    if (!initiative || initiative.projectId !== entityId) {
      return jsonError("entityId must be this initiative's project.", 400);
    }
  }

  try {
    const result = await runRecommendStatus({ entityType, entityId, userId: user.id, organizationId: user.organizationId });
    return NextResponse.json(result);
  } catch (err) {
    return mapAssistActionError(err);
  }
}
