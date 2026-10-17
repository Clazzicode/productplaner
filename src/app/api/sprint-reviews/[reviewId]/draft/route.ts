import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";
import { reviewAiSchema } from "@/lib/sprintReviews/model";
import { generateSprintReviewDraft } from "@/lib/sprintReviews/ai";

async function handler(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const row = await db.sprintReview.findUnique({ where: { id: reviewId }, select: { initiativeId: true } }); if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = reviewAiSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json(await generateSprintReviewDraft({ reviewId, userId: auth.user.id, organizationId: auth.user.organizationId })); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); return mapAssistActionError(error); }
}
export const POST = withApi(handler);
