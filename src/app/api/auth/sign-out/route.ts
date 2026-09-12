import { NextResponse } from "next/server";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Both cookies are browser-scoped, not account-scoped — clear them here so
  // the next account signed into on this browser doesn't inherit this
  // account's active organization or leftover onboarding answers.
  await clearActiveOrganizationCookie();
  await clearOnboardingStateServer();
  return NextResponse.json({ ok: true });
}
