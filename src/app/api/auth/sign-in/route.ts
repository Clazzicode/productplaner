import { NextResponse } from "next/server";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { provisionSoloWorkspace } from "@/lib/auth/session";
import { usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { db, establishAuthContext } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToPlaceholderEmail(parsed.data.username),
    password: parsed.data.password,
  });
  if (error) {
    // Supabase's own auth-js docs this error class for exactly this: a 500-504
    // gateway/infra hiccup, not a real rejection — "should not cause session
    // invalidation." Reported the same as bad credentials, a transient blip on
    // Supabase's end looks identical to a wrong password and sends users
    // chasing a typo that was never there. Reproduced directly against this
    // project's Supabase instance: a fresh, correct sign-in occasionally comes
    // back as this error class rather than succeeding.
    if (isAuthRetryableFetchError(error)) {
      return jsonError("Sign-in service is temporarily unavailable. Please try again in a moment.", 503);
    }
    return jsonError("Incorrect username or password.", 401);
  }

  // Sign-up creates the Supabase Auth account and this app's own User row as
  // two separate steps (sign-up route), with no rollback between them. If the
  // User-row step ever fails partway (a transient DB/pooler error), the auth
  // account is left with no matching User row: Supabase happily signs it in,
  // but the rest of the app has nothing to resolve it to and treats the
  // request as signed out. Self-heal that here with the same idempotent-safe
  // provisioning sign-up itself uses, so a stuck account recovers on its next
  // sign-in instead of looping back to /login forever.
  establishAuthContext(data.user.id);
  const existing = await db.user.findUnique({ where: { authUserId: data.user.id } });
  if (!existing) {
    await provisionSoloWorkspace({
      authUserId: data.user.id,
      name: parsed.data.username,
      email: usernameToPlaceholderEmail(parsed.data.username),
    });
  }

  return NextResponse.json({ ok: true });
}
