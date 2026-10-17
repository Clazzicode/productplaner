import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";
import { generateClarificationDraft } from "@/lib/clarifications/ai";

async function handler(_request: Request, { params }: { params: Promise<{ clarificationId: string }> }) {
  const { clarificationId } = await params;
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const row = await db.inSprintClarification.findUnique({ where: { id: clarificationId }, select: { initiativeId: true } });
  if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.initiativeId, "edit"); if (!access.ok) return access.response;
  const role = requireOrganizationRole(auth.user, ["owner", "admin"]); if (!role.ok) return role.response;
  try { return Response.json(await generateClarificationDraft({ clarificationId, userId: auth.user.id, organizationId: auth.user.organizationId })); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); return mapAssistActionError(error); }
}

export const POST = withApi(handler);

