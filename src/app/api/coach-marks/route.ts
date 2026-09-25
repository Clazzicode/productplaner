import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

async function GETHandler() {
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
async function DELETEHandler() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  await db.coachMarkDismissal.deleteMany({ where: { userId: authGuard.user.id } });
  return NextResponse.json({ ok: true });
}

export const GET = withApi(GETHandler);
export const DELETE = withApi(DELETEHandler);
