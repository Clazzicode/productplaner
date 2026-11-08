import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

async function DELETEHandler(_request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  establishAuthContext(guard.user.authUserId);
  if (!guard.user.authUserId || !["owner", "admin"].includes(guard.user.permissionRole)) return jsonError("Only workspace owners and admins can revoke invitations.", 403);
  const { invitationId } = await context.params;
  const result = await db.organizationInvitation.updateMany({
    where: { id: invitationId, organizationId: guard.user.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) return jsonError("Invitation not found or no longer active.", 404);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi(DELETEHandler);
