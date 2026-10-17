import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { jiraImportApplySchema } from "@/lib/jira/model";
import { applyJiraImport, loadJiraImport } from "@/lib/jira/import";
import { jiraImportForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";

async function getHandler(_request: Request, { params }: { params: Promise<{ runId: string }> }) { const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId); const { runId } = await params; const access = await jiraImportForUser(auth.user, runId); if (!access.ok) return access.response; return Response.json({ importRun: await loadJiraImport(runId) }); }
async function patchHandler(request: Request, { params }: { params: Promise<{ runId: string }> }) { const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId); const { runId } = await params; const access = await jiraImportForUser(auth.user, runId); if (!access.ok) return access.response; const parsed = jiraImportApplySchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422); try { return Response.json({ importRun: await applyJiraImport(runId, parsed.data.selectedItemIds, parsed.data.reason, auth.user.id) }); } catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not apply the Jira import.", 400); } }
export const GET = withApi(getHandler); export const PATCH = withApi(patchHandler);
