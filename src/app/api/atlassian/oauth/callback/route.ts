import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireCurrentUserApi } from "@/lib/auth/session";
import {
  AtlassianOAuthError,
  atlassianOAuthConfig,
  encryptAtlassianTokens,
  exchangeAtlassianCode,
  getAtlassianAccessibleResources,
} from "@/lib/atlassian/oauth";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { currentRequestId, withApi } from "@/lib/observability";

export const runtime = "nodejs";

function resultRedirect(origin: string, status: string, returnPath = "/integrations", connectionId?: string) {
  const destination = new URL(returnPath, origin);
  destination.searchParams.set("atlassian", status);
  if (connectionId) destination.searchParams.set("connectionId", connectionId);
  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "referrer-policy": "no-referrer", "cache-control": "no-store" },
  });
}

async function GETHandler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) {
    auth.response.headers.set("referrer-policy", "no-referrer");
    return auth.response;
  }
  const actor = auth.user;
  if (!actor.authUserId) return NextResponse.json({ error: "Account is not fully provisioned." }, { status: 409 });
  establishAuthContext(actor.authUserId);
  const role = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!role.ok) return role.response;

  let returnOrigin: string;
  try { returnOrigin = new URL(atlassianOAuthConfig().redirectUri).origin; }
  catch (error) {
    if (error instanceof AtlassianOAuthError) {
      return NextResponse.json({ error: "Atlassian OAuth is not configured." }, {
        status: 503,
        headers: { "referrer-policy": "no-referrer", "cache-control": "no-store" },
      });
    }
    throw error;
  }

  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "";
  const code = query.get("code") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return resultRedirect(returnOrigin, "invalid_state");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const pending = await db.$queryRaw<Array<{ organizationId: string; initiativeId: string | null; returnPath: string }>>`
    DELETE FROM app_private."AtlassianOAuthState"
    WHERE "stateHash" = ${stateHash}
      AND "organizationId" = ${actor.organizationId}
      AND "createdByUserId" = ${actor.id}
      AND "expiresAt" > now()
    RETURNING "organizationId", "initiativeId", "returnPath"
  `;
  if (!pending[0]) return resultRedirect(returnOrigin, "invalid_state");

  const returnPath = pending[0].returnPath === "/integrations/jira" ? "/integrations/jira" : "/integrations";
  if (query.has("error")) return resultRedirect(returnOrigin, "cancelled", returnPath);
  if (!code || code.length > 16_384) return resultRedirect(returnOrigin, "failed", returnPath);

  try {
    const tokens = await exchangeAtlassianCode(code);
    const resources = await getAtlassianAccessibleResources(tokens.accessToken);
    if (!resources.length) return resultRedirect(returnOrigin, "no_sites", returnPath);

    // Persist one grant per Clarivia workspace. All Atlassian sites authorized
    // in this grant are retained as metadata; tokens remain in a private table
    // as authenticated ciphertext, never in IntegrationConnection settings.
    const resourceMetadata = resources.map(({ id, name, url, scopes }) => ({ id, name, url, scopes }));
    const tokenCiphertext = encryptAtlassianTokens(actor.organizationId, tokens);
    const accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const jiraConnectionId = randomUUID();
    await withTransaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO app_private."AtlassianOAuthConnection" (
          "id", "organizationId", "connectedByUserId", "resourceMetadata", "grantedScopes",
          "tokenCiphertext", "accessTokenExpiresAt", "status", "connectedAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${actor.organizationId}, ${actor.id}, ${JSON.stringify(resourceMetadata)}::jsonb,
          ${tokens.scopes}, ${tokenCiphertext}, ${accessTokenExpiresAt}, 'connected', now(), now()
        )
        ON CONFLICT ("organizationId") DO UPDATE SET
          "connectedByUserId" = EXCLUDED."connectedByUserId",
          "resourceMetadata" = EXCLUDED."resourceMetadata",
          "grantedScopes" = EXCLUDED."grantedScopes",
          "tokenCiphertext" = EXCLUDED."tokenCiphertext",
          "accessTokenExpiresAt" = EXCLUDED."accessTokenExpiresAt",
          "status" = 'connected',
          "connectedAt" = now(),
          "updatedAt" = now()
      `;
      await tx.jiraConnection.updateMany({
        where: { organizationId: actor.organizationId, initiativeId: pending[0].initiativeId, status: { not: "revoked" } },
        data: { status: "revoked", accessTokenCiphertext: `vault-reference:${actor.organizationId}`, refreshTokenCiphertext: `vault-reference:${actor.organizationId}`, tokenExpiresAt: new Date(), revision: { increment: 1 } },
      });
      await tx.jiraConnection.create({
        data: {
          id: jiraConnectionId,
          organizationId: actor.organizationId,
          initiativeId: pending[0].initiativeId,
          configuredByUserId: actor.id,
          status: resources.length === 1 ? "project_selection_required" : "site_selection_required",
          ...(resources.length === 1 ? { cloudId: resources[0].id, siteUrl: resources[0].url, siteName: resources[0].name } : {}),
          accessTokenCiphertext: `vault-reference:${actor.organizationId}`,
          refreshTokenCiphertext: `vault-reference:${actor.organizationId}`,
          tokenExpiresAt: accessTokenExpiresAt,
          scopes: tokens.scopes.join(" "),
          accessibleResources: resourceMetadata,
        },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId: actor.organizationId,
          actorUserId: actor.id,
          entityType: "integration",
          entityId: jiraConnectionId,
          action: "atlassian.oauth.connected",
          metadata: { siteCount: resourceMetadata.length, scopes: tokens.scopes, initiativeId: pending[0].initiativeId },
          requestId: currentRequestId(),
        },
      });
    });
    return resultRedirect(returnOrigin, "connected", returnPath, jiraConnectionId);
  } catch (error) {
    if (error instanceof AtlassianOAuthError && error.code === "TOKEN_ENCRYPTION_NOT_CONFIGURED") {
      return resultRedirect(returnOrigin, "setup_required", returnPath);
    }
    if (error instanceof AtlassianOAuthError && error.code === "OAUTH_SCOPE_MISMATCH") {
      return resultRedirect(returnOrigin, "permissions_required", returnPath);
    }
    return resultRedirect(returnOrigin, "failed", returnPath);
  }
}

export const GET = withApi(GETHandler);
