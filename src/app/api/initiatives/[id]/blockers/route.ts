import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { blockerCreateSchema } from "@/lib/dependencies/model";
import { createPlanningBlocker } from "@/lib/dependencies/service";
import { withApi } from "@/lib/observability";

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const access = await requireInitiativeApiAccess(auth.user, id, "view"); if (!access.ok) return access.response;
  return NextResponse.json({ blockers: await db.planningBlocker.findMany({ where: { initiativeId: id, organizationId: auth.user.organizationId }, include: { owner: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }) });
}

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const access = await requireInitiativeApiAccess(auth.user, id, "edit"); if (!access.ok) return access.response;
  const parsed = blockerCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return NextResponse.json({ blocker: await createPlanningBlocker(id, parsed.data, auth.user.id) }, { status: 201 }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
