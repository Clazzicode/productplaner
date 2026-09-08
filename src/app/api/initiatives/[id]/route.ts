import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { initiativePatchSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "view");
  if (!guard.ok) return guard.response;

  const initiative = await db.initiative.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      methodology: true,
      status: true,
      targetLaunchDate: true,
      budget: true,
      averageHourlyRate: true,
      updatedAt: true,
    },
  });
  if (!initiative) return jsonError("Initiative not found.", 404);
  return NextResponse.json(initiative);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = initiativePatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const existing = await db.initiative.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return jsonError("Initiative not found.", 404);

  await db.initiative.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
