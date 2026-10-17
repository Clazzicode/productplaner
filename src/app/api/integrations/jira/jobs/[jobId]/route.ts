import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { manageJiraJob } from "@/lib/jira/jobs";
import { jiraJobCommandSchema } from "@/lib/jira/model";
import { jiraJobForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";
import { withApi } from "@/lib/observability";

async function handler(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await jiraJobForUser(auth.user, jobId);
  if (!access.ok) return access.response;
  const parsed = jiraJobCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    return Response.json({ job: await manageJiraJob(jobId, parsed.data.action, auth.user.id) });
  } catch (error) {
    return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not update the Jira job.", 400);
  }
}

export const PATCH = withApi(handler);
