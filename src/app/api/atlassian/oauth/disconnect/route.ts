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
    const removed = await tx.$executeRaw`
      DELETE FROM app_private."AtlassianOAuthConnection"
      WHERE "organizationId" = ${actor.organizationId}
    `;
    if (removed) {
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
  return NextResponse.json({ disconnected: true });
}

export const DELETE = withApi(DELETEHandler);
