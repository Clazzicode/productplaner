import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import {
  IntakeInvalidError,
  RecalculateBlockedError,
  recalculatePlan,
} from "@/lib/generation/engine";
import { recalculatePlanSchema } from "@/lib/validation/schemas";

export async function POST(
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
    const result = await recalculatePlan(id, parsed.data.mode);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof IntakeInvalidError) {
      return NextResponse.json(
        { error: "Intake has unresolved flags.", validation: err.validation },
        { status: 422 },
      );
    }
    if (err instanceof RecalculateBlockedError) {
      return jsonError(err.message, 409);
    }
    return jsonError(err instanceof Error ? err.message : "Recalculate failed.", 500);
  }
}
