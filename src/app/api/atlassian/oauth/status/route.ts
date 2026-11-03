import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

async function GETHandler() {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  if (!auth.user.authUserId) return NextResponse.json({ error: "Account is not fully provisioned." }, { status: 409 });
  establishAuthContext(auth.user.authUserId);
  const rows = await db.$queryRaw<Array<{
    status: string;
    resource_metadata: unknown;
    granted_scopes: string[];
    access_token_expires_at: Date;
    connected_at: Date;
  }>>`
    SELECT * FROM app_private.atlassian_oauth_status(${auth.user.organizationId})
  `;
  const row = rows[0];
  if (!row) return NextResponse.json({ connection: null });

  const resources = Array.isArray(row.resource_metadata)
    ? row.resource_metadata.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const resource = item as Record<string, unknown>;
        if (typeof resource.id !== "string" || typeof resource.name !== "string" || typeof resource.url !== "string") return [];
        try {
          const url = new URL(resource.url);
          if (url.protocol !== "https:") return [];
          return [{ id: resource.id, name: resource.name, host: url.host }];
        } catch { return []; }
      })
    : [];

  return NextResponse.json({
    connection: {
      status: row.status,
      resources,
      grantedScopes: row.granted_scopes,
      accessTokenExpiresAt: row.access_token_expires_at.toISOString(),
      connectedAt: row.connected_at.toISOString(),
    },
  });
}

export const GET = withApi(GETHandler);
