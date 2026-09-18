import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { runRecommendSprints } from "@/lib/ai/actions/recommendSprints";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";

// AI Assist trigger — RECOMMEND_SPRINTS (Section 4). Never invents team
// capacity/velocity — runRecommendSprints throws InsufficientContextError
// (mapped to 422) before any Anthropic call if team size isn't entered yet.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  try {
    const result = await runRecommendSprints({ initiativeId: id, userId: user.id, organizationId: user.organizationId });
    return NextResponse.json(result);
  } catch (err) {
    return mapAssistActionError(err);
  }
}

export const POST = withApi(POSTHandler);
