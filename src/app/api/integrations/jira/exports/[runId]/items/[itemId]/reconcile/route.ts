import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { reconcileUncertainJiraCreate } from "@/lib/jira/export";
import { jiraCreateReconcileSchema } from "@/lib/jira/model";
import { jiraExportForUser } from "@/lib/jira/routeAccess";

async function handler(request: Request, { params }: { params: Promise<{ runId: string; itemId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { runId, itemId } = await params;
  const access = await jiraExportForUser(auth.user, runId); if (!access.ok) return access.response;
  const item = await db.jiraExportItem.findFirst({ where: { id: itemId, exportRunId: runId, organizationId: auth.user.organizationId }, select: { id: true } });
  if (!item) return jsonError("Not found.", 404);
  const parsed = jiraCreateReconcileSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ exportRun: await reconcileUncertainJiraCreate(itemId, parsed.data.jiraKey, parsed.data.reason, auth.user.id) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not reconcile the Jira create.", 400); }
}
export const POST = withAuthenticatedApi(handler);
