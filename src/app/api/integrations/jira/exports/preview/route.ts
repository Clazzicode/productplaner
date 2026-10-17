import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { previewJiraExport } from "@/lib/jira/export";
import { jiraExportPreviewSchema } from "@/lib/jira/model";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { withApi } from "@/lib/observability";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const parsed = jiraExportPreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const access = await jiraConnectionForUser(auth.user, parsed.data.connectionId); if (!access.ok) return access.response;
  try { return Response.json({ exportRun: await previewJiraExport(parsed.data.connectionId, auth.user.id) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not preview the Jira export.", 400); }
}
export const POST = withApi(handler);
