import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { jiraSiteSchema } from "@/lib/jira/model";
import { selectJiraSite } from "@/lib/jira/oauth";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";

async function handler(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { connectionId } = await params; const access = await jiraConnectionForUser(auth.user, connectionId); if (!access.ok) return access.response;
  const parsed = jiraSiteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ connection: await selectJiraSite(connectionId, parsed.data.cloudId, parsed.data.expectedRevision) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not select Jira site.", 400); }
}
export const PATCH = withApi(handler);
