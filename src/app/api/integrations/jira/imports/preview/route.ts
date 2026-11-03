import { withApi } from "@/lib/observability";
import { randomUUID } from "node:crypto";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { jiraImportPreviewSchema } from "@/lib/jira/model";
import { enqueueJiraImportPreview } from "@/lib/jira/jobs";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const parsed = jiraImportPreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const access = await jiraConnectionForUser(auth.user, parsed.data.connectionId);
  if (!access.ok) return access.response;
  try {
    const job = await enqueueJiraImportPreview(access.connection, auth.user.id, parsed.data.idempotencyKey ?? randomUUID());
    return Response.json({ job: { id: job.id, status: job.status } }, { status: 202 });
  } catch (error) {
    return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not queue the Jira import.", 400);
  }
}
export const POST = withApi(handler);
