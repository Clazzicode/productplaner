import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError } from "@/lib/api";

function changedFields(previous: unknown, next: unknown): string[] {
  const before = previous && typeof previous === "object" ? previous as Record<string, unknown> : {};
  const after = next && typeof next === "object" ? next as Record<string, unknown> : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "view");
  if (!access.ok) return access.response;
  const planningRequest = await db.planningRequest.findFirst({ where: { id: requestId, initiativeId: id }, select: { id: true } });
  if (!planningRequest) return jsonError("Request not found.", 404);
  const revisions = await db.requestRevision.findMany({
    where: { requestId },
    orderBy: { toRevision: "desc" },
    include: { changedByUser: { select: { name: true, email: true } } },
  });
  return Response.json({ revisions: revisions.map((revision) => ({
    id: revision.id,
    fromRevision: revision.fromRevision,
    toRevision: revision.toRevision,
    reason: revision.reason,
    changedBy: revision.changedByUser?.name || revision.changedByUser?.email || "System",
    changedFields: changedFields(revision.previousData, revision.nextData),
    sourceAiAssistItemId: revision.sourceAiAssistItemId,
    createdAt: revision.createdAt.toISOString(),
  })) });
}

export const GET = withApi(GETHandler);
