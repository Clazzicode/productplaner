import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { bugPlanningUpdateSchema } from "@/lib/bugs/model";
import { updateBugPlanningRecord } from "@/lib/bugs/service";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

async function PATCHHandler(request: Request, { params }: { params: Promise<{ bugId: string }> }) {
  const { bugId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const bug = await db.bugPlanningRecord.findFirst({
    where: { id: bugId, organizationId: auth.user.organizationId }, select: { initiativeId: true },
  });
  if (!bug) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, bug.initiativeId, "edit");
  if (!access.ok) return access.response;
  const parsed = bugPlanningUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    return NextResponse.json({ bug: await updateBugPlanningRecord(bugId, parsed.data, auth.user.id) });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const PATCH = withApi(PATCHHandler);
