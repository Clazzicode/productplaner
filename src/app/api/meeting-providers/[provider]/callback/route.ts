import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { db, establishAuthContext } from "@/lib/db";
import { exchangeCode, encryptTokens, isMeetingProvider, providerAccountEmail, providerConfig } from "@/lib/meetings/providers";

export const runtime = "nodejs";

async function GETHandler(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isMeetingProvider(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const query = new URL(request.url).searchParams;
  const cookieName = `meeting_oauth_${provider}`;
  const cookie = (await cookies()).get(cookieName)?.value ?? "";
  const state = query.get("state") ?? "";
  const expected = `${auth.user.id}.${state}`;
  const valid = state.length === 43 && cookie.length === expected.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
  const origin = new URL(providerConfig(provider).redirectUri).origin;
  const finish = (result: string) => {
    const url = new URL("/integrations", origin);
    url.searchParams.set("meetingProvider", provider);
    url.searchParams.set("connection", result);
    const response = NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    response.cookies.delete(cookieName);
    return response;
  };
  if (!valid) return finish("invalid_state");
  if (query.has("error")) return finish("cancelled");
  try {
    const grant = await exchangeCode(provider, query.get("code") ?? "");
    const accountEmail = await providerAccountEmail(provider, grant.tokens.accessToken);
    await db.personalIntegrationConnection.upsert({
      where: { organizationId_userId_provider: { organizationId: auth.user.organizationId, userId: auth.user.id, provider } },
      create: { organizationId: auth.user.organizationId, userId: auth.user.id, provider, accountEmail,
        tokenCiphertext: encryptTokens(auth.user.organizationId, auth.user.id, provider, grant.tokens), accessTokenExpiresAt: new Date(grant.expiresAt) },
      update: { accountEmail, tokenCiphertext: encryptTokens(auth.user.organizationId, auth.user.id, provider, grant.tokens), accessTokenExpiresAt: new Date(grant.expiresAt) },
    });
    return finish("connected");
  } catch {
    return finish("failed");
  }
}

export const GET = withAuthenticatedApi(GETHandler);
