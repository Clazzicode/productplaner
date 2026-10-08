import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import { roadmapFeatureUpdateSchema, updateRoadmapFeature } from "@/lib/roadmap/planning";

async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ id: string; capabilityId: string }> },
) {
  const { id, capabilityId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);

  const guard = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = roadmapFeatureUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    return NextResponse.json(await updateRoadmapFeature(id, capabilityId, parsed.data));
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const PATCH = withApi(PATCHHandler);
