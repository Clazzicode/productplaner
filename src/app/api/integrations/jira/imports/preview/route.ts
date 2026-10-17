import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { jiraImportPreviewSchema } from "@/lib/jira/model";
import { previewJiraImport } from "@/lib/jira/import";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";

async function handler(request: Request) { const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId); const parsed = jiraImportPreviewSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422); const access = await jiraConnectionForUser(auth.user, parsed.data.connectionId); if (!access.ok) return access.response; try { return Response.json({ importRun: await previewJiraImport(parsed.data.connectionId, auth.user.id) }); } catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not preview the Jira import.", 400); } }
export const POST = withApi(handler);
