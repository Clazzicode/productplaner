import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; userId: string }> },
) {
  const { teamId, userId } = await params;
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage team membership.", 403);

  await db.teamMember.deleteMany({ where: { teamId, userId } });
  return NextResponse.json({ ok: true });
}
