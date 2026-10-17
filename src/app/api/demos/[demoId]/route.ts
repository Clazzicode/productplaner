import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { demoCommandSchema } from "@/lib/demos/model";
import { applyDemoCommand } from "@/lib/demos/service";

async function handler(request: Request, { params }: { params: Promise<{ demoId: string }> }) {
  const { demoId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const row = await db.demoItem.findUnique({ where: { id: demoId }, select: { initiativeId: true } }); if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = demoCommandSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ demo: await applyDemoCommand(demoId, parsed.data, auth.user.id, requireOrganizationRole(auth.user, ["owner", "admin"]).ok) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const PATCH = withApi(handler);
