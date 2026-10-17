import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { reviewGenerateSchema } from "@/lib/sprintReviews/model";
import { createOrRefreshReview, loadReviewDetails } from "@/lib/sprintReviews/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (request.method === "GET") {
    const rows = await db.sprintReview.findMany({ where: { initiativeId: id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return Response.json({ reviews: (await Promise.all(rows.map(row => loadReviewDetails(row.id)))).filter(Boolean) });
  }
  const parsed = reviewGenerateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ review: await createOrRefreshReview(id, parsed.data.sprintId, auth.user.id, parsed.data.expectedRevision, parsed.data.reason) }, { status: parsed.data.expectedRevision ? 200 : 201 }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const GET = withApi(handler);
export const POST = withApi(handler);
