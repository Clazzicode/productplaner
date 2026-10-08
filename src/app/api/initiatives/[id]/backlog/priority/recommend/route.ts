import { z } from "zod";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";
import { recomputeFingerprintForItem } from "@/lib/ai/assist/recomputeFingerprint";
import { runPriorityRecommendation } from "@/lib/ai/actions/recommendPriority";

const targetSchema = z.object({
  entityType: z.enum(["request", "feature", "story"]),
  entityId: z.string().min(1),
}).strict();

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  const role = requireOrganizationRole(auth.user, ["owner", "admin"]);
  if (!role.ok) return role.response;

  const raw = request.method === "GET"
    ? Object.fromEntries(new URL(request.url).searchParams.entries())
    : await request.json();
  const parsed = targetSchema.safeParse(raw);
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const targetType = `priority_${parsed.data.entityType}`;

  if (request.method === "POST") {
    try {
      const result = await runPriorityRecommendation({
        initiativeId: id,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        userId: auth.user.id,
        organizationId: auth.user.organizationId,
      });
      return Response.json(result);
    } catch (error) {
      return mapAssistActionError(error);
    }
  }

  const items = await db.aiAssistItem.findMany({
    where: { initiativeId: id, actionKey: "RECOMMEND_PRIORITY", targetType, targetId: parsed.data.entityId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  await Promise.all(items.filter(item => item.status === "proposed").map(async item => {
    const fresh = await recomputeFingerprintForItem(item);
    if (fresh && fresh !== item.fingerprint) {
      await db.aiAssistItem.update({ where: { id: item.id }, data: { status: "stale" } });
      item.status = "stale";
    }
  }));
  return Response.json({ items });
}

export const GET = withApi(handler);
export const POST = withApi(handler);
