import { withApi } from "@/lib/observability";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { authCallbackUrl, emailSchema, passwordSchema } from "@/lib/auth/credentials";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureAuthenticatedWorkspace } from "@/lib/auth/provision";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

const signUpSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Enter your name.").max(100),
  password: passwordSchema,
});

async function POSTHandler(request: Request) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { email, name, password } = parsed.data;
  const supabase = await createSupabaseServerClient();
  // The public flow applies confirmation, password policies, and provider throttles.
  // Never pre-confirm customer addresses through the service-role Admin API.
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { name }, emailRedirectTo: authCallbackUrl(request) },
  });
  if (error) {
    if ((error.status ?? 0) >= 500) return jsonError("Sign-up unavailable.", 503);
    if (error.code === "weak_password") return jsonError("Choose a stronger password that has not appeared in a data breach.", 422);
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      return jsonError("Could not create the account. Check your details or try again later.", 400);
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
