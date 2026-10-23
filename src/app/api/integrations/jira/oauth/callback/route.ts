import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";

async function handler(request: Request) {
  const destination = new URL("/integrations/jira?atlassian=invalid_state", request.url);
  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "referrer-policy": "no-referrer", "cache-control": "no-store" },
  });
}

export const GET = withApi(handler);
