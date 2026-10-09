import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import { readinessDecisionSchema } from "@/lib/sprintPreparation/model";
import { recordReadinessDecision } from "@/lib/sprintPreparation/service";

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const access = await requireInitiativeApiAccess(auth.user, id, "edit"); if (!access.ok) return access.response;
  const parsed = readinessDecisionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  if (parsed.data.decision !== "not_ready" && auth.user.permissionRole === "member") return jsonError("Only an organization owner or administrator can approve sprint readiness.", 403);
  try { return NextResponse.json({ assessment: await recordReadinessDecision(id, parsed.data, auth.user.id, auth.user.permissionRole === "owner" || auth.user.permissionRole === "admin") }, { status: 201 }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const POST = withApi(POSTHandler);
