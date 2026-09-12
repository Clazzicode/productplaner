import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export async function GET() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const rows = await db.coachMarkDismissal.findMany({
    where: { userId: authGuard.user.id },
    select: { key: true },
  });
  return NextResponse.json({ dismissedKeys: rows.map((r) => r.key) });
}

/** "Replay Product Tour" (account menu) — clears every dismissal so coach
 * marks reappear at their anchors without replaying the full onboarding. */
export async function DELETE() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  await db.coachMarkDismissal.deleteMany({ where: { userId: authGuard.user.id } });
  return NextResponse.json({ ok: true });
}
