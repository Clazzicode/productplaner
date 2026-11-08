import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext, withTransaction } from "@/lib/db";
import { currentRequestId, withApi } from "@/lib/observability";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

async function DELETEHandler() {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  const actor = auth.user;
  if (!actor.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(actor.authUserId);
  const role = requireOrganizationRole(actor, ["owner", "admin"]);
  if (!role.ok) return role.response;

  let stage = "revoke_connections";
  try {
  await withTransaction(async (tx) => {
    await tx.jiraConnection.updateMany({
      where: { organizationId: actor.organizationId, status: { not: "revoked" } },
      data: {
        status: "revoked",
        accessTokenCiphertext: `vault-reference:${actor.organizationId}`,
        refreshTokenCiphertext: `vault-reference:${actor.organizationId}`,
        tokenExpiresAt: new Date(),
        revision: { increment: 1 },
      },
    });
    stage = "find_revoked_connections";
    const revokedConnections = await tx.jiraConnection.findMany({
      where: { organizationId: actor.organizationId, status: "revoked" },
      select: { id: true },
    });
    for (const connection of revokedConnections) {
      stage = "purge_source_data";
      await tx.$executeRaw`SELECT app_private.purge_jira_source_data(${connection.id})`;
    }
    stage = "delete_workspace_grant";
    const removed = await tx.$executeRaw`
      DELETE FROM app_private."AtlassianOAuthConnection"
      WHERE "organizationId" = ${actor.organizationId}
    `;
    if (removed) {
      stage = "write_audit_event";
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId: actor.organizationId,
          actorUserId: actor.id,
          entityType: "integration",
          entityId: "atlassian-oauth",
          action: "atlassian.oauth.disconnected",
          requestId: currentRequestId(),
        },
      });
    }
  });
  } catch (error) {
    const details = error && typeof error === "object" ? error as { code?: unknown; meta?: { code?: unknown } } : null;
    console.error(JSON.stringify({
      event: "atlassian.disconnect.failed",
      requestId: currentRequestId(),
      stage,
      prismaCode: typeof details?.code === "string" ? details.code : undefined,
      databaseCode: typeof details?.meta?.code === "string" ? details.meta.code : undefined,
    }));
    throw error;
  }
  return NextResponse.json({ disconnected: true });
}

export const DELETE = withApi(DELETEHandler);
