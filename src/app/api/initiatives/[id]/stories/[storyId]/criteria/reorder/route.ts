import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { acceptanceCriteriaReorderSchema } from "@/lib/validation/schemas";
import { reorderAcceptanceCriteria } from "@/lib/stories/service";
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string; storyId: string }> }) {
  const { id, storyId } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit"); if (!access.ok) return access.response;
  const parsed = acceptanceCriteriaReorderSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  await reorderAcceptanceCriteria(id, storyId, parsed.data.orderedIds, auth.user.id); return NextResponse.json({ ok: true });
}
export const POST = withApi(POSTHandler);
