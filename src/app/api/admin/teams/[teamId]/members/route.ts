import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

const addMemberSchema = z.object({ userId: z.string().min(1) });

/**
 * Duplicate membership is blocked at the database level
 * (@@unique([teamId, userId]) on TeamMember) — this just turns that
 * constraint violation into a friendly response instead of a 500.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage team membership.", 403);

  const parsed = addMemberSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || team.organizationId !== actor.organizationId) return jsonError("Team not found.", 404);

  const targetUser = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { homeOrganizationId: true },
  });
  if (!targetUser || targetUser.homeOrganizationId !== actor.organizationId) {
    return jsonError("User not found.", 404);
  }

  try {
    const membership = await db.teamMember.create({
      data: { teamId, userId: parsed.data.userId },
    });
    return NextResponse.json(membership, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return jsonError("This person is already on the team.", 409);
    }
    throw err;
  }
}
