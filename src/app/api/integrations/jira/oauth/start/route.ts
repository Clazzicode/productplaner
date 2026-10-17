import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { beginJiraOAuth } from "@/lib/jira/oauth";
import { jiraStartSchema } from "@/lib/jira/model";
import { requireJiraManager } from "@/lib/jira/routeAccess";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const parsed = jiraStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const access = await requireJiraManager(auth.user, parsed.data.initiativeId); if (!access.ok) return access.response;
  try { return Response.json({ authorizationUrl: await beginJiraOAuth({ organizationId: auth.user.organizationId, initiativeId: parsed.data.initiativeId, userId: auth.user.id, returnPath: parsed.data.returnPath }) }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "Could not start Jira authorization.", 400); }
}
export const POST = withApi(handler);
