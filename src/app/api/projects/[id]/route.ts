import { NextResponse } from "next/server";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { projectPatchSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireProjectApiAccess(authGuard.user, id);
  if (!guard.ok) return guard.response;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      initiatives: { select: { id: true, name: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" } },
      risks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return jsonError("Project not found.", 404);
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireProjectApiAccess(authGuard.user, id);
  if (!guard.ok) return guard.response;

  const parsed = projectPatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const existing = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return jsonError("Project not found.", 404);

  await db.project.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
