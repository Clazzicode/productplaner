import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { runRecommendReleases } from "@/lib/ai/actions/recommendReleases";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";

// AI Assist trigger — RECOMMEND_RELEASES (Section 4). A recommendation only
// — "Apply" opens the existing manual release form client-side, it never
// writes a Release row from this route.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  try {
    const result = await runRecommendReleases({ initiativeId: id, userId: user.id, organizationId: user.organizationId });
    return NextResponse.json(result);
  } catch (err) {
    return mapAssistActionError(err);
  }
}

export const POST = withApi(POSTHandler);
