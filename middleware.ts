import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { applySecurityResponseHeaders, buildContentSecurityPolicy } from "@/lib/securityHeaders";

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = await updateSupabaseSession(request, requestHeaders);
  applySecurityResponseHeaders(response, contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
