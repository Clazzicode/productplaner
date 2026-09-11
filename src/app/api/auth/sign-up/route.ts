import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { provisionSoloWorkspace } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(request: Request) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { name, email, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) return jsonError(error?.message ?? "Could not create account.", 400);

  // Supabase always creates the auth.users row immediately, even when email
  // confirmation is required before a session is issued — so the app-side
  // User/Organization row is provisioned right away too, keyed to that id.
  // establishAuthContext uses the now-verified new user's id — trustworthy
  // here because it's exactly what supabase.auth.signUp() just returned.
  establishAuthContext(data.user.id);
  const existing = await db.user.findUnique({ where: { authUserId: data.user.id } });
  if (!existing) {
    await provisionSoloWorkspace({ authUserId: data.user.id, name, email });
  }

  if (!data.session) {
    // Email confirmation is required by the Supabase project today, but
    // outbound confirmation delivery isn't reliable yet (tracked separately —
    // not fixed here). Rather than leave a newly-created account stuck until
    // that's sorted out, auto-confirm it via the Admin API and sign the user
    // straight in, the same way sign-in does. The confirmation email itself
    // still gets sent by Supabase; nothing here depends on the user ever
    // opening it. Remove this once real email confirmation is ready to enforce.
    try {
      const adminClient = createSupabaseServiceClient();
      const { error: confirmError } = await adminClient.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      if (confirmError) throw confirmError;

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch {
      // Auto-confirm/sign-in didn't work — the account was still created, so
      // fall back to the original "check your email" flow instead of failing
      // signup outright.
      return NextResponse.json({ ok: true, needsEmailConfirmation: true });
    }
  }

  return NextResponse.json({ ok: true, needsEmailConfirmation: false });
}
