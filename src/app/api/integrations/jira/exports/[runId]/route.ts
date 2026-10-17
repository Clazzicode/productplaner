import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { approveJiraExport, loadJiraExport } from "@/lib/jira/export";
import { jiraExportApprovalSchema } from "@/lib/jira/model";
import { jiraExportForUser } from "@/lib/jira/routeAccess";
import { withApi } from "@/lib/observability";

async function GETHandler(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { runId } = await params; const access = await jiraExportForUser(auth.user, runId); if (!access.ok) return access.response;
  return Response.json({ exportRun: await loadJiraExport(runId) });
}
async function PATCHHandler(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const { runId } = await params; const access = await jiraExportForUser(auth.user, runId); if (!access.ok) return access.response;
  const parsed = jiraExportApprovalSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ exportRun: await approveJiraExport(runId, parsed.data.selectedItemIds, parsed.data.reason, auth.user.id) }); }
  catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not approve the Jira export.", 400); }
}
export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
