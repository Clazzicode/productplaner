import { NextResponse } from "next/server";
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
  if (error) return jsonError("Incorrect username or password.", 401);

  return NextResponse.json({ ok: true });
}
