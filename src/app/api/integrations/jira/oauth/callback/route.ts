import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { completeJiraOAuth } from "@/lib/jira/oauth";

export const runtime = "nodejs";

async function handler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  let outcome = "connected";
  if (!state || !code || url.searchParams.has("error")) {
    outcome = "invalid_state";
  } else {
    try {
      await completeJiraOAuth({ state, code, userId: auth.user.id, organizationId: auth.user.organizationId });
    } catch {
      outcome = "connection_failed";
    }
  }
  return NextResponse.redirect(new URL(`/integrations/jira?${new URLSearchParams({ jira: outcome })}`, url.origin), {
    status: 303,
    headers: { "referrer-policy": "no-referrer", "cache-control": "no-store" },
  });
}

export const GET = withAuthenticatedApi(handler);
