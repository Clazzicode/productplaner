import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { COACH_MARK_KEYS } from "@/lib/coachMarks/keys";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!COACH_MARK_KEYS.includes(key as never)) return jsonError("Unknown coach mark key.", 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  await db.coachMarkDismissal.upsert({
    where: { userId_key: { userId: authGuard.user.id, key } },
    create: { userId: authGuard.user.id, key },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
