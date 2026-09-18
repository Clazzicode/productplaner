import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { ApprovedBaselineImpactError, IntakeInvalidError, recalculatePlan } from "@/lib/generation/engine";
import { generateSchema } from "@/lib/validation/schemas";

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = generateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  try {
    // Routes through recalculatePlan's "full" mode — the same guarded path
    // RefreshBar's Regenerate button uses — so a plan that's already
    // approved can never be silently overwritten by a stray/replayed call to
    // this route.
    const { prototypeId } = await recalculatePlan(id, "full", {
      confirmApprovedImpact: parsed.data.confirmApprovedImpact,
    });
    return NextResponse.json({ prototypeId });
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
    return jsonError(err instanceof Error ? err.message : "Generation failed.", 500);
  }
}

export const POST = withApi(POSTHandler);
