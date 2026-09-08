import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { clearCurrentUserCookie, getCurrentUser, setCurrentUserCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Prototype-level "act as this user" switcher (src/app/login) — NOT real
// authentication. No password is checked; anyone can switch to any existing
// account. It exists purely so per-account features are testable as distinct
// accounts. See src/lib/auth/session.ts.
const switchSchema = z.union([
  z.object({ userId: z.string().trim().min(1) }),
  z.object({ name: z.string().trim().min(1, "Name is required."), email: z.string().trim().email("Enter a valid email.") }),
]);

export async function POST(request: Request) {
  const parsed = switchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  if ("userId" in parsed.data) {
    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Account not found.", 404);
    await setCurrentUserCookie(user.id);
    return NextResponse.json({ ok: true, userId: user.id });
  }

  const { name, email } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await setCurrentUserCookie(existing.id);
    return NextResponse.json({ ok: true, userId: existing.id });
  }

  // New accounts join whichever organization this browser is currently in —
  // this prototype has no cross-org signup flow.
  const current = await getCurrentUser();
  const created = await db.user.create({
    data: { organizationId: current.organizationId, name, email, accessLevel: "standard_user" },
  });
  await setCurrentUserCookie(created.id);
  return NextResponse.json({ ok: true, userId: created.id });
}

export async function DELETE() {
  await clearCurrentUserCookie();
  return NextResponse.json({ ok: true });
}
