import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { provisionSoloWorkspace } from "@/lib/auth/session";
import { usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { db, establishAuthContext } from "@/lib/db";
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    // Supabase reports a taken placeholder address the same way it would a
    // real duplicate email — translate that back into username terms.
    const message = /already registered|already exists/i.test(error.message)
      ? "That username is already taken."
      : error.message;
    return jsonError(message, 400);
  }
  if (!data.user) return jsonError("Could not create account.", 400);

  // Supabase always creates the auth.users row immediately, even when email
  // confirmation is required before a session is issued — so the app-side
  // User/Organization row is provisioned right away too, keyed to that id.
  // establishAuthContext uses the now-verified new user's id — trustworthy
  // here because it's exactly what supabase.auth.signUp() just returned.
  establishAuthContext(data.user.id);
  const existing = await db.user.findUnique({ where: { authUserId: data.user.id } });
  if (!existing) {
    await provisionSoloWorkspace({ authUserId: data.user.id, name: username, email });
  }

  if (!data.session) {
    // Temporary username+password auth (no real email collected at all) —
    // there is no inbox to confirm, so always auto-confirm via the Admin API
    // and sign the user straight in, the same way sign-in does. Revisit
    // alongside src/lib/auth/username.ts once real email sign-up is ready.
    try {
      const adminClient = createSupabaseServiceClient();
      const { error: confirmError } = await adminClient.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      if (confirmError) throw confirmError;

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch {
      return jsonError("Account created, but signing you in automatically failed — try signing in.", 500);
    }
  }

  return NextResponse.json({ ok: true });
}
