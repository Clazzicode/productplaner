import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { acceptanceCriterionApproveSchema } from "@/lib/validation/schemas";
import { approveAcceptanceCriterion } from "@/lib/stories/service";
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string; criterionId: string }> }) {
  const { id, criterionId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit"); if (!access.ok) return access.response;
  const parsed = acceptanceCriterionApproveSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  return NextResponse.json({ criterion: await approveAcceptanceCriterion(id, criterionId, auth.user.id, parsed.data.comment) });
}
export const POST = withApi(POSTHandler);
