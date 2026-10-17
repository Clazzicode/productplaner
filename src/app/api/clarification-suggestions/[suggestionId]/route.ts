import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { clarificationSuggestionCommandSchema } from "@/lib/clarifications/model";
import { dismissClarificationSuggestion } from "@/lib/clarifications/service";

async function handler(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  const { suggestionId } = await params;
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const suggestion = await db.clarificationAiSuggestion.findUnique({ where: { id: suggestionId }, include: { clarification: { select: { initiativeId: true } } } });
  if (!suggestion) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, suggestion.clarification.initiativeId, "edit"); if (!access.ok) return access.response;
  const role = requireOrganizationRole(auth.user, ["owner", "admin"]); if (!role.ok) return role.response;
  const parsed = clarificationSuggestionCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  if (parsed.data.action === "use") return Response.json({ suggestion });
  try { return Response.json({ suggestion: await dismissClarificationSuggestion(suggestionId, auth.user.id) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const PATCH = withApi(handler);

