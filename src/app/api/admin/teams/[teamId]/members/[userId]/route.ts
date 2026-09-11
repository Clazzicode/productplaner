import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; userId: string }> },
) {
  const { teamId, userId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage team membership.", 403);

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || team.organizationId !== actor.organizationId) return jsonError("Team not found.", 404);

  await db.teamMember.deleteMany({ where: { teamId, userId } });
  return NextResponse.json({ ok: true });
}
