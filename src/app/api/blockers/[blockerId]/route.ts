import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { blockerUpdateSchema } from "@/lib/dependencies/model";
import { updatePlanningBlocker } from "@/lib/dependencies/service";
import { withApi } from "@/lib/observability";

async function PATCHHandler(request: Request, { params }: { params: Promise<{ blockerId: string }> }) {
  const { blockerId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const blocker = await db.planningBlocker.findFirst({ where: { id: blockerId, organizationId: auth.user.organizationId }, select: { initiativeId: true } });
  if (!blocker) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, blocker.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = blockerUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return NextResponse.json({ blocker: await updatePlanningBlocker(blockerId, parsed.data, auth.user.id, auth.user.permissionRole === "owner" || auth.user.permissionRole === "admin") }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const PATCH = withApi(PATCHHandler);
