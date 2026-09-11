import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { intakePatchSchema } from "@/lib/validation/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = intakePatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId: id } });
  if (!intake) return jsonError("Initiative not found.", 404);

  // Intake stays editable even after generation (the "living plan" demo feature) —
  // changes only take effect once the user explicitly recalculates the plan via
  // /api/initiatives/[id]/recalculate, so editing here never silently changes a
  // live prototype.
  await db.intakeAnswerSet.update({ where: { id: intake.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
