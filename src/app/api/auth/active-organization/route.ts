import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi, setActiveOrganization } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";

const switchSchema = z.object({ organizationId: z.string().trim().min(1) });

async function POSTHandler(request: Request) {
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  establishAuthContext(guard.user.authUserId);

  const parsed = switchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  // setActiveOrganization re-validates against a real, active membership row —
  // never trusts this organizationId just because the request named it.
  const ok = await setActiveOrganization(guard.user.authUserId!, parsed.data.organizationId);
  if (!ok) return jsonError("You aren't a member of that organization.", 403);

  return NextResponse.json({ ok: true });
}

export const POST = withApi(POSTHandler);
