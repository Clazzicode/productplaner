import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { jiraWebhookCommandSchema } from "@/lib/jira/model";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { registerWebhook, renewWebhook } from "@/lib/jira/webhooks";
import { withApi } from "@/lib/observability";

async function handler(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { connectionId } = await params; const access = await jiraConnectionForUser(auth.user, connectionId); if (!access.ok) return access.response;
  const parsed = jiraWebhookCommandSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ subscription: parsed.data.action === "register" ? await registerWebhook(connectionId) : await renewWebhook(connectionId) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not configure the Jira webhook.", 400); }
}
export const POST = withApi(handler);
