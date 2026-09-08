import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
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
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "edit");
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
