import { z } from "zod";
import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { authCallbackUrl, emailSchema } from "@/lib/auth/credentials";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function POSTHandler(request: Request) {
  const parsed = z.object({ email: emailSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authCallbackUrl(request, true),
  });
  // Account absence, disabled status, and per-account throttles must not reveal identities.
  if (error && (error.status ?? 0) >= 500) return jsonError("Email service unavailable.", 503);
  return Response.json({ ok: true, message: "If an account exists, a password reset link has been sent. Open it in this browser." });
}

export const POST = withApi(POSTHandler);
