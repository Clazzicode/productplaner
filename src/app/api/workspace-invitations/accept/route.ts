import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi, setActiveOrganization } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

const acceptSchema = z.object({ token: z.string().min(40).max(100) });

async function POSTHandler(request: Request) {
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  establishAuthContext(guard.user.authUserId);
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  let organizationId: string;
  try {
    const rows = await db.$queryRaw<Array<{ organizationId: string }>>`
      SELECT app_private.accept_organization_invitation(${tokenHash}) AS "organizationId"
    `;
    organizationId = rows[0]?.organizationId;
    if (!organizationId) throw new Error("Invitation unavailable");
  } catch (error) {
    // Do not distinguish wrong email, expiration, revocation or reuse. Let
    // infrastructure failures surface as server errors for safe diagnostics.
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (["22023", "42501", "23505"].includes(String(code))) {
      return jsonError("This invitation is invalid, expired, already used, or belongs to another email address.", 400);
    }
    throw error;
  }

  const activated = await setActiveOrganization(guard.user.authUserId!, organizationId);
  if (!activated) return jsonError("The invitation was accepted, but workspace access could not be activated. Refresh and sign in again.", 503);
  return NextResponse.json({ ok: true, organizationId });
}

export const POST = withApi(POSTHandler);
