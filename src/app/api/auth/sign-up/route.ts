import { withApi } from "@/lib/observability";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { authCallbackUrl, emailSchema, passwordSchema } from "@/lib/auth/credentials";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ensureAuthenticatedWorkspace } from "@/lib/auth/provision";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { normalizeUsername, usernameSchema } from "@/lib/auth/username";

const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  name: z.string().trim().min(1, "Enter your name.").max(100),
  password: passwordSchema,
});

async function POSTHandler(request: Request) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { username, email, name, password } = parsed.data;
  const normalized = normalizeUsername(username);
  const service = createSupabaseServiceClient();
  const { data: existingUsername, error: lookupError } = await service
    .from("AuthUsername")
    .select("authUserId")
    .eq("normalized", normalized)
    .maybeSingle();
  if (lookupError) return jsonError("Sign-up unavailable.", 503);
  if (existingUsername) return jsonError("That username is unavailable.", 409);

  const supabase = await createSupabaseServerClient();
  // The public flow applies confirmation, password policies, and provider throttles.
  // Never pre-confirm customer addresses through the service-role Admin API.
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { name, username }, emailRedirectTo: authCallbackUrl(request) },
  });
  if (error) {
    if ((error.status ?? 0) >= 500) return jsonError("Sign-up unavailable.", 503);
    if (error.code === "weak_password") return jsonError("Choose a stronger password that has not appeared in a data breach.", 422);
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      return jsonError("Could not create the account. Check your details or try again later.", 400);
    }
  }
  const isNewIdentity = !error && data.user && (data.user.identities?.length ?? 0) > 0;
  if (isNewIdentity) {
    const { error: reserveError } = await service.from("AuthUsername").insert({
      id: crypto.randomUUID(),
      authUserId: data.user!.id,
      username,
      normalized,
    });
    if (reserveError) {
      await service.auth.admin.deleteUser(data.user!.id);
      if (reserveError.code === "23505") return jsonError("That username is unavailable.", 409);
      return jsonError("Sign-up unavailable.", 503);
    }
  }
  // Duplicate addresses and unconfirmed accounts receive the same response.
  if (!error && data.session && data.user?.email_confirmed_at) {
    await ensureAuthenticatedWorkspace(data.user);
    await clearActiveOrganizationCookie();
    await clearOnboardingStateServer();
    return Response.json({ ok: true, confirmationRequired: false });
  }
  return Response.json({ ok: true, confirmationRequired: true,
    message: "Check your email to confirm your account. Open the link in this browser. If you already have an account, sign in or reset your password." });
}

export const POST = withApi(POSTHandler);
