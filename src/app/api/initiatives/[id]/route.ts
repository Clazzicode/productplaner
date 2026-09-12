import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveInitiativeEconomics } from "@/lib/projectContext";
import { initiativePatchSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "view");
  if (!guard.ok) return guard.response;

  const initiative = await db.initiative.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      name: true,
      description: true,
      methodology: true,
      status: true,
      updatedAt: true,
      targetLaunchDateOverride: true,
      budgetOverride: true,
      averageHourlyRateOverride: true,
      project: { select: { budget: true, averageHourlyRate: true, targetLaunchDate: true } },
    },
  });
  if (!initiative) return jsonError("Initiative not found.", 404);
  const { project, ...rest } = initiative;
  return NextResponse.json({ ...rest, ...resolveInitiativeEconomics(initiative, project) });
}

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

  const parsed = initiativePatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const existing = await db.initiative.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return jsonError("Initiative not found.", 404);

  await db.initiative.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
