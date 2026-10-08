import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { priorityDecisionCommand } from "@/lib/prioritization/model";
import { listPriorityHistory, savePriorityDecision } from "@/lib/prioritization/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") ?? undefined;
    const entityId = url.searchParams.get("entityId") ?? undefined;
    if ((entityType && !entityId) || (!entityType && entityId)) return jsonError("Choose both an entity type and entity id.", 422);
    return Response.json({ history: await listPriorityHistory(id, entityType, entityId) });
  }

  const role = requireOrganizationRole(auth.user, ["owner", "admin"]);
  if (!role.ok) return role.response;
  const parsed = priorityDecisionCommand.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const decision = await savePriorityDecision(id, parsed.data, auth.user.id);
  return Response.json({ decision });
}

export const GET = withApi(handler);
export const POST = withApi(handler);
