import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { getAtlassianAccessToken } from "@/lib/atlassian/credentials";
import { AtlassianOAuthError, getAtlassianAccessibleResources } from "@/lib/atlassian/oauth";
import { establishAuthContext, withTransaction } from "@/lib/db";
import { currentRequestId, withApi } from "@/lib/observability";

export const runtime = "nodejs";

async function POSTHandler() {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  const actor = auth.user;
  if (!actor.authUserId) return NextResponse.json({ error: "Account is not fully provisioned." }, { status: 409 });
  establishAuthContext(actor.authUserId);
  const role = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!role.ok) return role.response;

  try {
    const accessToken = await getAtlassianAccessToken(actor.organizationId);
    const resources = await getAtlassianAccessibleResources(accessToken);
    const resourcesMetadata = resources.map(({ id, name, url, scopes }) => ({ id, name, url, scopes }));
    await withTransaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE app_private."AtlassianOAuthConnection"
        SET "resourceMetadata" = ${JSON.stringify(resourcesMetadata)}::jsonb,
            status = ${resources.length ? "connected" : "reconnect_required"},
            "updatedAt" = now()
        WHERE "organizationId" = ${actor.organizationId}
      `;
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId: actor.organizationId,
          actorUserId: actor.id,
          entityType: "integration",
          entityId: "atlassian-oauth",
          action: resources.length ? "atlassian.oauth.verified" : "atlassian.oauth.reconnect_required",
          metadata: { siteCount: resources.length },
          requestId: currentRequestId(),
        },
      });
    });
    if (!resources.length) {
      return NextResponse.json({ verified: false, reconnectRequired: true, error: "No Jira sites are currently available to this grant." }, { status: 409 });
    }
    return NextResponse.json({ verified: true, siteCount: resources.length });
  } catch (error) {
    if (error instanceof AtlassianOAuthError && error.code === "OAUTH_PROVIDER_REJECTED") {
      await withTransaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE app_private."AtlassianOAuthConnection"
          SET status = 'reconnect_required', "updatedAt" = now()
          WHERE "organizationId" = ${actor.organizationId}
        `;
      });
      return NextResponse.json({ verified: false, reconnectRequired: true, error: "Atlassian no longer accepts this connection. Reconnect to restore access." }, { status: 409 });
    }
    if (error instanceof AtlassianOAuthError && error.code === "OAUTH_REFRESH_REQUIRED") {
      return NextResponse.json({ verified: false, reconnectRequired: true, error: "Reconnect Atlassian to restore access." }, { status: 409 });
    }
    if (error instanceof AtlassianOAuthError && error.code === "OAUTH_PROVIDER_TEMPORARY") {
      return NextResponse.json({ verified: false, error: "Atlassian is temporarily unavailable. Try again shortly." }, { status: 503 });
    }
    throw error;
  }
}

export const POST = withApi(POSTHandler);
