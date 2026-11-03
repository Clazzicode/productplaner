import "server-only";
import { AtlassianOAuthError, decryptAtlassianTokens, encryptAtlassianTokens, refreshAtlassianTokens } from "./oauth";
import { withTransaction } from "@/lib/db";

/**
 * Returns a usable Atlassian access token only inside trusted server code.
 * The caller must already have established an authenticated workspace-admin
 * RLS context. Refresh is row-locked so rotating refresh tokens are replaced
 * serially instead of allowing parallel requests to overwrite one another.
 */
export async function getAtlassianAccessToken(organizationId: string): Promise<string> {
  const result = await withTransaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      tokenCiphertext: string;
      accessTokenExpiresAt: Date;
      status: string;
    }>>`
      SELECT "tokenCiphertext", "accessTokenExpiresAt", status
      FROM app_private."AtlassianOAuthConnection"
      WHERE "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    const connection = rows[0];
    if (!connection) throw new AtlassianOAuthError("OAUTH_NOT_CONNECTED");
    if (connection.status !== "connected") throw new AtlassianOAuthError("OAUTH_REFRESH_REQUIRED");

    const current = decryptAtlassianTokens(organizationId, connection.tokenCiphertext);
    if (connection.accessTokenExpiresAt.getTime() > Date.now() + 90_000) {
      return { accessToken: current.accessToken };
    }

    let refreshed;
    try {
      refreshed = await refreshAtlassianTokens(current.refreshToken);
    } catch (error) {
      if (error instanceof AtlassianOAuthError && error.code === "OAUTH_PROVIDER_REJECTED") {
        await tx.$executeRaw`
          UPDATE app_private."AtlassianOAuthConnection"
          SET status = 'reconnect_required', "updatedAt" = now()
          WHERE "organizationId" = ${organizationId}
        `;
        return { reconnectRequired: true as const };
      }
      throw error;
    }

    await tx.$executeRaw`
      UPDATE app_private."AtlassianOAuthConnection"
      SET "tokenCiphertext" = ${encryptAtlassianTokens(organizationId, refreshed)},
          "grantedScopes" = ${refreshed.scopes},
          "accessTokenExpiresAt" = ${new Date(Date.now() + refreshed.expiresIn * 1000)},
          status = 'connected',
          "updatedAt" = now()
      WHERE "organizationId" = ${organizationId}
    `;
    return { accessToken: refreshed.accessToken };
  });

  if ("reconnectRequired" in result) throw new AtlassianOAuthError("OAUTH_REFRESH_REQUIRED");
  return result.accessToken;
}
