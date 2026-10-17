import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { demoSuggestionCommandSchema } from "@/lib/demos/model";
import { dismissDemoSuggestion } from "@/lib/demos/service";

async function handler(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  const { suggestionId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const row = await db.demoAiSuggestion.findUnique({ where: { id: suggestionId }, include: { demoItem: { select: { initiativeId: true } } } }); if (!row) return jsonError("Not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, row.demoItem.initiativeId, "edit"); if (!access.ok) return access.response;
  const parsed = demoSuggestionCommandSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ suggestion: await dismissDemoSuggestion(suggestionId, auth.user.id) }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const PATCH = withApi(handler);
