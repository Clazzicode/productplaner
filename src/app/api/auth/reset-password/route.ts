import { z } from "zod";
import { withApi } from "@/lib/observability";
import { jsonError, zodMessage } from "@/lib/api";
import { passwordSchema } from "@/lib/auth/credentials";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function POSTHandler(request: Request) {
  const parsed = z.object({ password: passwordSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return jsonError("Open a valid password reset link first.", 401);
  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) return jsonError("Could not update your password. Use a strong, different password or request a new link.", 400);
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}

export const POST = withApi(POSTHandler);
