import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { db, establishAuthContext } from "@/lib/db";
import { encryptTokens } from "@/lib/meetings/providers";
import { exchangeNotionCode, notionRedirectUri } from "@/lib/notes/notion";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const origin = new URL(notionRedirectUri()).origin;
  const finish = (result: string) => {
    const url = new URL("/integrations", origin);
    url.searchParams.set("notion", result);
    const response = NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    response.cookies.delete("notion_oauth");
    return response;
  };
  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "";
  const cookie = (await cookies()).get("notion_oauth")?.value ?? "";
  const expected = `${auth.user.id}.${state}`;
  if (state.length !== 43 || cookie.length !== expected.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))) return finish("invalid_state");
  if (query.has("error")) return finish("cancelled");
  try {
    const grant = await exchangeNotionCode(query.get("code") ?? "");
    const tokenCiphertext = encryptTokens(auth.user.organizationId, auth.user.id, "notion", { accessToken: grant.access_token, refreshToken: grant.refresh_token });
    await db.personalIntegrationConnection.upsert({
      where: { organizationId_userId_provider: { organizationId: auth.user.organizationId, userId: auth.user.id, provider: "notion" } },
      create: { organizationId: auth.user.organizationId, userId: auth.user.id, provider: "notion", accountLabel: grant.workspace_name ?? "Notion workspace", tokenCiphertext },
      update: { accountLabel: grant.workspace_name ?? "Notion workspace", tokenCiphertext },
    });
    return finish("connected");
  } catch { return finish("failed"); }
}

export const GET = withAuthenticatedApi(GETHandler);
