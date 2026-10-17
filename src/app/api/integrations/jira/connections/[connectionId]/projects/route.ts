import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { jiraProjectSchema } from "@/lib/jira/model";
import { configureJiraProject, discoverJiraProjectMetadata, discoverJiraProjects } from "@/lib/jira/oauth";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";
import { BusinessError } from "@/lib/businessError";

async function guard(connectionId: string) { const auth = await requireCurrentUserApi(); if (!auth.ok) return auth; establishAuthContext(auth.user.authUserId); const access = await jiraConnectionForUser(auth.user, connectionId); return access.ok ? { ok: true as const, user: auth.user } : access; }
async function getHandler(request: Request, { params }: { params: Promise<{ connectionId: string }> }) { const { connectionId } = await params; const access = await guard(connectionId); if (!access.ok) return access.response; try { const projectId = new URL(request.url).searchParams.get("projectId"); return projectId ? Response.json({ metadata: await discoverJiraProjectMetadata(connectionId, projectId) }) : Response.json({ projects: await discoverJiraProjects(connectionId) }); } catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not load Jira project metadata.", 400); } }
async function patchHandler(request: Request, { params }: { params: Promise<{ connectionId: string }> }) { const { connectionId } = await params; const access = await guard(connectionId); if (!access.ok) return access.response; const parsed = jiraProjectSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422); try { return Response.json({ connection: await configureJiraProject(connectionId, parsed.data) }); } catch (error) { return error instanceof BusinessError ? jsonError(error.message, error.status) : jsonError(error instanceof Error ? error.message : "Could not configure Jira project.", 400); } }
export const GET = withApi(getHandler); export const PATCH = withApi(patchHandler);
