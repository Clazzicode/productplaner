import { NextResponse } from "next/server";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
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

  return NextResponse.json({ ok: true });
}
