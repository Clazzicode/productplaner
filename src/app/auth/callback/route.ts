import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureAuthenticatedWorkspace } from "@/lib/auth/provision";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";
import { clearOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

async function GETHandler(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user?.email_confirmed_at) {
      if (url.searchParams.get("next") === "/reset-password") {
        return NextResponse.redirect(new URL("/reset-password", url.origin));
      }
      await ensureAuthenticatedWorkspace(data.user);
      await clearActiveOrganizationCookie();
      await clearOnboardingStateServer();
      return NextResponse.redirect(new URL("/", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?authError=link", url.origin));
}

export const GET = withApi(GETHandler);
