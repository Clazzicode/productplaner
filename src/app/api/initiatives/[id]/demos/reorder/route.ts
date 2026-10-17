import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { demoAgendaReorderSchema } from "@/lib/demos/model";
import { reorderDemoAgenda } from "@/lib/demos/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!access.ok) return access.response;
  if (!requireOrganizationRole(auth.user, ["owner", "admin"]).ok) return jsonError("Only an organization owner or administrator can reorder the demo agenda.", 403);
  const parsed = demoAgendaReorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ demos: await reorderDemoAgenda(id, parsed.data, auth.user.id) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const PATCH = withApi(handler);
