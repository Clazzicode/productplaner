import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { clearActiveOrganizationCookie, provisionSoloWorkspace } from "@/lib/auth/session";
import { usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { db, establishAuthContext } from "@/lib/db";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(request: Request) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { username, password } = parsed.data;
  const email = usernameToPlaceholderEmail(username);

  // Created via the Admin API (service role) instead of the public
  // supabase.auth.signUp() — signUp() always attempts to send a confirmation
  // email, even to this placeholder .invalid address, which burns against
  // Supabase's project-wide email rate limit and was failing sign-up outright
  // ("Email rate limit exceeded") once that limit was hit. admin.createUser()
  // bypasses the email pipeline entirely, and email_confirm: true skips
  // confirmation up front since there's no real inbox to confirm anyway.
  const adminClient = createSupabaseServiceClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    // Supabase reports a taken placeholder address the same way it would a
    // real duplicate email (admin.createUser()'s wording is "has already
    // been registered", not signUp()'s "already registered" — match both)
    // — translate that back into username terms.
    const message = /already.*registered|already exists/i.test(error.message)
      ? "That username is already taken."
      : error.message;
    return jsonError(message, 400);
  }
  if (!data.user) return jsonError("Could not create account.", 400);

  establishAuthContext(data.user.id);
  const existing = await db.user.findUnique({ where: { authUserId: data.user.id } });
  if (!existing) {
    await provisionSoloWorkspace({ authUserId: data.user.id, name: username, email });
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return jsonError("Account created, but signing you in automatically failed — try signing in.", 500);
  }

  // This browser may have just been used to set up a different account (e.g.
  // creating accounts for other people back-to-back) — without this, the new
  // account's onboarding silently inherits the previous account's leftover
  // active organization / workspace-type / working-role answers instead of
  // asking this account's own questions.
  await clearActiveOrganizationCookie();
  await clearOnboardingStateServer();

  return NextResponse.json({ ok: true });
}
