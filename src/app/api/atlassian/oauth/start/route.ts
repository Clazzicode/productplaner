import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { buildAtlassianAuthorizationUrl, newOAuthState, AtlassianOAuthError } from "@/lib/atlassian/oauth";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  const actor = auth.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const role = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!role.ok) return role.response;

  const body = await request.json().catch(() => ({})) as { initiativeId?: unknown; returnPath?: unknown };
  const initiativeId = typeof body.initiativeId === "string" && body.initiativeId.length <= 64 ? body.initiativeId : null;
  const returnPath = body.returnPath === "/integrations/jira" ? body.returnPath : "/integrations";
  if (initiativeId) {
    const initiative = await db.initiative.findFirst({ where: { id: initiativeId, organizationId: actor.organizationId }, select: { id: true } });
    if (!initiative) return jsonError("Choose an initiative in this workspace.", 404);
  }

  let authorizationUrl: string;
  try {
    const pending = newOAuthState();
    authorizationUrl = buildAtlassianAuthorizationUrl(pending.state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await withTransaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM app_private."AtlassianOAuthState"
        WHERE "organizationId" = ${actor.organizationId}
          AND "createdByUserId" = ${actor.id}
          AND "expiresAt" <= now()
      `;
      await tx.$executeRaw`
        INSERT INTO app_private."AtlassianOAuthState" ("id", "organizationId", "createdByUserId", "stateHash", "expiresAt", "initiativeId", "returnPath")
        VALUES (${randomUUID()}, ${actor.organizationId}, ${actor.id}, ${pending.stateHash}, ${expiresAt}, ${initiativeId}, ${returnPath})
      `;
    });
  } catch (error) {
    if (error instanceof AtlassianOAuthError && error.code === "OAUTH_NOT_CONFIGURED") {
      return jsonError("Atlassian OAuth is not configured for this deployment yet.", 503);
    }
    throw error;
  }
  return NextResponse.json({ authorizationUrl });
}

export const POST = withApi(POSTHandler);
