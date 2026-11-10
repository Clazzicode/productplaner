import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { authorizationUrl, isMeetingProvider } from "@/lib/meetings/providers";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

async function POSTHandler(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isMeetingProvider(provider)) return jsonError("Unknown meeting provider.", 404);
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action === "disconnect") {
    await db.personalIntegrationConnection.deleteMany({ where: { organizationId: auth.user.organizationId, userId: auth.user.id, provider } });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "connect") return jsonError("Unknown action.", 422);
  try {
    const state = randomBytes(32).toString("base64url");
    const url = authorizationUrl(provider, state);
    const response = NextResponse.json({ authorizationUrl: url });
    response.cookies.set(`meeting_oauth_${provider}`, `${auth.user.id}.${state}`, {
      httpOnly: true, secure: new URL(url).protocol === "https:" && process.env.NODE_ENV === "production",
      sameSite: "lax", path: `/api/meeting-providers/${provider}`, maxAge: 600,
    });
    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not start connection.", 503);
  }
}

export const POST = withAuthenticatedApi(POSTHandler);
