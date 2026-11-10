import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { notionAuthorizationUrl } from "@/lib/notes/notion";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action === "disconnect") {
    await db.personalIntegrationConnection.deleteMany({ where: { organizationId: auth.user.organizationId, userId: auth.user.id, provider: "notion" } });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "connect") return jsonError("Unknown action.", 422);
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.json({ authorizationUrl: notionAuthorizationUrl(state) });
    response.cookies.set("notion_oauth", `${auth.user.id}.${state}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/notion", maxAge: 600 });
    return response;
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Could not connect Notion.", 503); }
}

export const POST = withAuthenticatedApi(POSTHandler);
