import { withApi } from "@/lib/observability";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { normalizeUsername, usernameSchema, usernameToPlaceholderEmail } from "@/lib/auth/username";
import { emailSchema } from "@/lib/auth/credentials";
import { ensureAuthenticatedWorkspace } from "@/lib/auth/provision";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email.").max(254).refine(
    (value) => emailSchema.safeParse(value).success || usernameSchema.safeParse(value).success,
    "Enter a valid username or email address.",
  ),
  password: z.string().min(1).max(128),
});

async function resolveEmail(identifier: string): Promise<string> {
  const email = emailSchema.safeParse(identifier);
  if (email.success) return email.data;

  const username = usernameSchema.parse(identifier);
  const service = createSupabaseServiceClient();
  const { data: credential, error } = await service
    .from("AuthUsername")
    .select("authUserId")
    .eq("normalized", normalizeUsername(username))
    .maybeSingle();
  if (error) throw new Error("Username lookup unavailable");
  if (!credential) return usernameToPlaceholderEmail(username);

  const { data, error: userError } = await service.auth.admin.getUserById(credential.authUserId);
  if (userError || !data.user?.email) throw new Error("Username identity unavailable");
  return data.user.email;
}

async function POSTHandler(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const credentials = parsed.data;
  let email: string;
  try {
    email = await resolveEmail(credentials.identifier);
  } catch {
    return jsonError("Sign-in unavailable.", 503);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
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
