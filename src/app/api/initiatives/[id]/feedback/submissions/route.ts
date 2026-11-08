import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { z } from "zod";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { createFeedback } from "@/lib/feedback/service";
import { feedbackCreateSchema } from "@/lib/feedback/model";
import { BusinessError } from "@/lib/businessError";
import { jsonError, zodMessage } from "@/lib/api";

const submission = z.object({
  title: feedbackCreateSchema.shape.title,
  details: feedbackCreateSchema.shape.details,
  link: feedbackCreateSchema.shape.link.optional(),
}).strict();

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const { id } = await params;
  try {
    await requireCollaborationAction(id, auth.user.id, "submit_feedback", auth.user.organizationId);
    const parsed = submission.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
    const row = await createFeedback(id, { ...parsed.data, link: parsed.data.link ?? null,
      source: "stakeholder", sourceReference: `submission:${auth.user.id}`, category: "general" }, auth.user.id);
    if (!row) throw new BusinessError("Feedback could not be recorded.", 409);
    return Response.json({ receipt: { id: row.feedback.id, status: "received" } }, { status: 201 });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const POST = withAuthenticatedApi(handler);
