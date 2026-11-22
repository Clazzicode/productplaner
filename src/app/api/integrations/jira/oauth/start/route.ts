import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { jsonError } from "@/lib/api";
import { db, establishAuthContext } from "@/lib/db";
import { beginJiraOAuth } from "@/lib/jira/oauth";

export const runtime = "nodejs";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  const actor = auth.user;
  establishAuthContext(actor.authUserId);
  const role = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!role.ok) return role.response;
  const body = await request.json().catch(() => ({})) as { initiativeId?: unknown };
  const initiativeId = typeof body.initiativeId === "string" && body.initiativeId.length <= 64 ? body.initiativeId : null;
  if (initiativeId) {
    const initiative = await db.initiative.findFirst({ where: { id: initiativeId, organizationId: actor.organizationId }, select: { id: true } });
    if (!initiative) return jsonError("Choose an initiative in this workspace.", 404);
  }
  try {
    const authorizationUrl = await beginJiraOAuth({ organizationId: actor.organizationId, initiativeId, userId: actor.id, returnPath: "/integrations/jira" });
    return Response.json({ authorizationUrl });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not start Jira authorization.", 503);
  }
}

export const POST = withAuthenticatedApi(handler);
