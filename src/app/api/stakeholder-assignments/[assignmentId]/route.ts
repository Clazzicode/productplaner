import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import { stakeholderAssignmentUpdateSchema } from "@/lib/stakeholders/model";
import { updateStakeholderAssignment } from "@/lib/stakeholders/service";

async function PATCHHandler(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const assignment = await db.stakeholderAssignment.findFirst({
    where: { id: assignmentId, organizationId: auth.user.organizationId },
    select: { initiativeId: true },
  });
  if (!assignment?.initiativeId) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, assignment.initiativeId, "edit");
  if (!access.ok) return access.response;
  const parsed = stakeholderAssignmentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    return NextResponse.json({ assignment: await updateStakeholderAssignment(
      assignmentId, auth.user.organizationId, parsed.data, auth.user.id,
    ) });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const PATCH = withApi(PATCHHandler);
