import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { resolveJiraConflict } from "@/lib/jira/conflicts";
import { jiraConflictResolutionSchema } from "@/lib/jira/model";
import { jiraConflictForUser } from "@/lib/jira/routeAccess";
import { withApi } from "@/lib/observability";

async function handler(request: Request, { params }: { params: Promise<{ conflictId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { conflictId } = await params; const access = await jiraConflictForUser(auth.user, conflictId); if (!access.ok) return access.response;
  const parsed = jiraConflictResolutionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ conflict: await resolveJiraConflict(conflictId, parsed.data.resolution, parsed.data.reason, auth.user.id) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not resolve the Jira conflict.", 400); }
}
export const PATCH = withApi(handler);
