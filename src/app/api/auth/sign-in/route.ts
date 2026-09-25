import { withApi } from "@/lib/observability";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { emailSchema } from "@/lib/auth/credentials";
import { ensureAuthenticatedWorkspace } from "@/lib/auth/provision";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

const signInSchema = z.union([
  z.object({ email: emailSchema, password: z.string().min(1).max(128) }),
  // Compatibility for existing prototype accounts; new registrations require email.
  z.object({ username: usernameSchema, password: z.string().min(1).max(128) }),
]);

async function POSTHandler(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const credentials = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "email" in credentials ? credentials.email : usernameToPlaceholderEmail(credentials.username),
    password: credentials.password,
  });
  if (error) {
    if (isAuthRetryableFetchError(error)) return jsonError("Sign-in unavailable.", 503);
    return jsonError("Could not sign in. Check your credentials and confirm your email if needed.", 401);
  }
  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut({ scope: "local" });
    return jsonError("Confirm your email before signing in.", 401);
  }
  await ensureAuthenticatedWorkspace(data.user);
  await clearActiveOrganizationCookie();
  await clearOnboardingStateServer();
  return Response.json({ ok: true });
}

export const POST = withApi(POSTHandler);
