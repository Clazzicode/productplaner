import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { runRequirementReview } from "@/lib/ai/actions/reviewRequirements";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";
import { recomputeFingerprintForItem } from "@/lib/ai/assist/recomputeFingerprint";

async function requireRequest(initiativeId: string, requestId: string) {
  return db.planningRequest.findFirst({ where: { id: requestId, initiativeId }, select: { id: true } });
}

async function handler(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (!await requireRequest(id, requestId)) return jsonError("Request not found.", 404);

  if (request.method === "POST") {
    try {
      const result = await runRequirementReview({ requestId, userId: auth.user.id, organizationId: auth.user.organizationId });
      return NextResponse.json(result);
    } catch (error) {
      return mapAssistActionError(error);
    }
  }

  const items = await db.aiAssistItem.findMany({
    where: {
      initiativeId: id,
      actionKey: "REVIEW_REQUIREMENTS",
      OR: [
        { targetType: "request_requirement_review", targetId: requestId },
        { targetType: "request_requirement", targetId: { startsWith: `${requestId}:` } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  await Promise.all(items.filter((item) => item.status === "proposed").map(async (item) => {
    const fresh = await recomputeFingerprintForItem(item);
    if (fresh && fresh !== item.fingerprint) {
      await db.aiAssistItem.update({ where: { id: item.id }, data: { status: "stale" } });
      item.status = "stale";
    }
  }));
  return NextResponse.json({ items });
}

export const GET = withApi(handler);
export const POST = withApi(handler);
