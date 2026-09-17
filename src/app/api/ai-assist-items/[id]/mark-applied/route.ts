import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { aiAssistMarkAppliedSchema } from "@/lib/validation/schemas";
import { requireAiAssistItemAccess } from "@/lib/ai/assist/itemAccess";

// POST /api/ai-assist-items/[id]/mark-applied (Section 4 §5) — for
// RECOMMEND_RELEASES/RECOMMEND_SPRINTS only. The client calls this right
// after the real, existing release/sprint form's own submit succeeds — this
// route performs no write of its own beyond recording that fact; the
// release/sprint row itself was already created through the platform's
// normal manual endpoint (POST /api/initiatives/[id]/releases, POST
// /api/releases/[releaseId]/sprints, POST /api/artifacts/[id]/move-sprint).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const item = await db.aiAssistItem.findUnique({ where: { id } });
  if (!item) return jsonError("Not found.", 404);
  if (item.actionKey !== "RECOMMEND_RELEASES" && item.actionKey !== "RECOMMEND_SPRINTS") {
    return jsonError("This recommendation applies automatically — use the apply endpoint instead.", 400);
  }

  const accessGuard = await requireAiAssistItemAccess(user, item);
  if (!accessGuard.ok) return accessGuard.response;

  if (item.status !== "proposed" && item.status !== "stale") {
    return jsonError(`This suggestion is already ${item.status.replace(/_/g, " ")}.`, 409);
  }

  const parsed = aiAssistMarkAppliedSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const updated = await db.aiAssistItem.update({
    where: { id },
    data: {
      status: "applied",
      appliedByUserId: user.id,
      appliedAt: new Date(),
      appliedEntityType: parsed.data.appliedEntityType,
      appliedEntityId: parsed.data.appliedEntityId,
    },
  });
  return NextResponse.json({ item: updated });
}
