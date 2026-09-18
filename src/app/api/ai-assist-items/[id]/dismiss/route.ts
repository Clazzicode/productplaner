import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { aiAssistDismissSchema } from "@/lib/validation/schemas";
import { requireAiAssistItemAccess } from "@/lib/ai/assist/itemAccess";

// POST /api/ai-assist-items/[id]/dismiss (Section 4 §5/§22) — only ever sets
// status/dismissedByUserId/dismissedAt/dismissReason. Touches nothing else.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const item = await db.aiAssistItem.findUnique({ where: { id } });
  if (!item) return jsonError("Not found.", 404);

  const accessGuard = await requireAiAssistItemAccess(user, item);
  if (!accessGuard.ok) return accessGuard.response;

  if (item.status !== "proposed" && item.status !== "stale") {
    return jsonError(`This suggestion is already ${item.status.replace(/_/g, " ")}.`, 409);
  }

  const parsed = aiAssistDismissSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const updated = await db.aiAssistItem.update({
    where: { id },
    data: {
      status: "dismissed",
      dismissedByUserId: user.id,
      dismissedAt: new Date(),
      dismissReason: parsed.data.reason ?? null,
    },
  });
  return NextResponse.json({ item: updated });
}

export const POST = withApi(POSTHandler);
