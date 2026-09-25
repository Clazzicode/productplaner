import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import {
  ApprovedBaselineImpactError,
  IntakeInvalidError,
  RecalculateBlockedError,
  recalculatePlan,
} from "@/lib/generation/engine";
import { recalculatePlanSchema } from "@/lib/validation/schemas";

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = recalculatePlanSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  try {
    const result = await recalculatePlan(id, parsed.data.mode, {
      confirmApprovedImpact: parsed.data.confirmApprovedImpact,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof IntakeInvalidError) {
      return NextResponse.json(
        { error: "Intake has unresolved flags.", validation: err.validation },
        { status: 422 },
      );
    }
    if (err instanceof ApprovedBaselineImpactError) {
      return NextResponse.json({ error: err.message, requiresApprovedImpactConfirmation: true }, { status: 409 });
    }
    if (err instanceof RecalculateBlockedError) {
      return jsonError(err.message, 409);
    }
    return jsonError(err instanceof Error ? err.message : "Recalculate failed.", 500);
  }
}

export const POST = withApi(POSTHandler);
