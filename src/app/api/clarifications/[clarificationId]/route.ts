import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { clarificationCommandSchema } from "@/lib/clarifications/model";
import { applyClarificationCommand } from "@/lib/clarifications/service";

async function handler(request: Request, { params }: { params: Promise<{ clarificationId: string }> }) {
  const { clarificationId } = await params;
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const row = await db.inSprintClarification.findUnique({ where: { id: clarificationId }, select: { initiativeId: true } });
  if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = clarificationCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const canDecide = requireOrganizationRole(auth.user, ["owner", "admin"]).ok;
  try { return Response.json({ clarification: await applyClarificationCommand(clarificationId, parsed.data, auth.user.id, canDecide) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const PATCH = withApi(handler);

