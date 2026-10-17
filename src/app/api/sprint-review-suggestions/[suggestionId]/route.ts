import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { reviewSuggestionSchema } from "@/lib/sprintReviews/model";
import { dismissReviewSuggestion } from "@/lib/sprintReviews/service";

async function handler(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  const { suggestionId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const row = await db.sprintReviewAiSuggestion.findUnique({ where: { id: suggestionId }, select: { reviewId: true } }); if (!row) return jsonError("Not found.", 404);
  const review = await db.sprintReview.findUnique({ where: { id: row.reviewId }, select: { initiativeId: true } }); if (!review) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, review.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = reviewSuggestionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ suggestion: await dismissReviewSuggestion(suggestionId, auth.user.id) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const PATCH = withApi(handler);
