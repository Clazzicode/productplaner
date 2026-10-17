import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { disconnectJira } from "@/lib/jira/oauth";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";
import { withApi } from "@/lib/observability";

async function handler(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await jiraConnectionForUser(auth.user, connectionId);
  if (!access.ok) return access.response;
  try {
    return Response.json(await disconnectJira(connectionId, auth.user.id));
  } catch (error) {
    return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not disconnect Jira.", 400);
  }
}

export const DELETE = withApi(handler);
