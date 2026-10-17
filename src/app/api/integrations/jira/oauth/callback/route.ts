import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { completeJiraOAuth } from "@/lib/jira/oauth";
import { requireJiraManager } from "@/lib/jira/routeAccess";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireJiraManager(auth.user); if (!access.ok) return access.response;
  await ensureProvidersSeeded();
  const url = new URL(request.url); const state = url.searchParams.get("state"); const code = url.searchParams.get("code"); const oauthError = url.searchParams.get("error");
  if (oauthError) return NextResponse.redirect(new URL(`/integrations/jira?error=${encodeURIComponent(oauthError)}`, url.origin));
  if (!state || !code) return NextResponse.redirect(new URL("/integrations/jira?error=missing_oauth_response", url.origin));
  try {
    const result = await completeJiraOAuth({ state, code, userId: auth.user.id, organizationId: auth.user.organizationId });
    const destination = new URL(result.returnPath, url.origin); destination.searchParams.set("connectionId", result.connection.id); destination.searchParams.set("connected", "1");
    return NextResponse.redirect(destination);
  } catch (error) {
    return NextResponse.redirect(new URL(`/integrations/jira?error=${encodeURIComponent(error instanceof Error ? error.message : "authorization_failed")}`, url.origin));
  }
}
export const GET = withApi(handler);
