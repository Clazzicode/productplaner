import { NextResponse } from "next/server";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { decisionCreateSchema } from "@/lib/validation/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireProjectApiAccess(user, id);
  if (!guard.ok) return guard.response;

  const parsed = decisionCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  if (parsed.data.initiativeId) {
    const initiative = await db.initiative.findUnique({
      where: { id: parsed.data.initiativeId },
      select: { projectId: true },
    });
    if (!initiative || initiative.projectId !== id) return jsonError("Initiative not found in this project.", 404);
  }

  const decision = await db.decision.create({
    data: {
      organizationId: user.organizationId,
      projectId: id,
      initiativeId: parsed.data.initiativeId ?? null,
      title: parsed.data.title,
      description: parsed.data.description,
      decidedByUserId: user.id,
      decidedAt: new Date(),
    },
  });
  return NextResponse.json({ decisionId: decision.id });
}
