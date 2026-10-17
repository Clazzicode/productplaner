import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";
import { demoDraftSchema } from "@/lib/demos/model";
import { generateDemoDraft } from "@/lib/demos/ai";

async function handler(request: Request, { params }: { params: Promise<{ demoId: string }> }) {
  const { demoId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const row = await db.demoItem.findUnique({ where: { id: demoId }, select: { initiativeId: true } }); if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = demoDraftSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json(await generateDemoDraft({ demoItemId: demoId, kind: parsed.data.kind, userId: auth.user.id, organizationId: auth.user.organizationId })); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); return mapAssistActionError(error); }
}
export const POST = withApi(handler);
