import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "view");
  if (!access.ok) return access.response;
  const [connections, links] = await Promise.all([
    db.jiraConnection.findMany({ where: { initiativeId: id, status: { not: "revoked" } }, select: { id: true, status: true, siteUrl: true, projectKey: true, lastSyncAt: true, lastSyncStatus: true } }),
    db.jiraExternalLink.findMany({ where: { initiativeId: id }, select: { connectionId: true, targetType: true, targetId: true, externalIssueId: true, externalKey: true, deliveryStatusName: true, deliveryMappedStatus: true, deliveryPriorityName: true, deliveryLabels: true, deliverySourceUpdatedAt: true, deliveryObservedAt: true, deliveryRevision: true } }),
  ]);
  const active = new Map(connections.map(connection => [connection.id, connection]));
  const items = links.filter(link => active.has(link.connectionId)).map(link => {
    const connection = active.get(link.connectionId)!;
    return {
      targetType: link.targetType,
      targetId: link.targetId,
      externalIssueId: link.externalIssueId,
      externalKey: link.externalKey,
      jiraUrl: connection.siteUrl?.startsWith("https://") ? `${connection.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(link.externalKey)}` : null,
      deliveryStatusName: link.deliveryStatusName,
      deliveryMappedStatus: link.deliveryMappedStatus,
      deliveryPriorityName: link.deliveryPriorityName,
      deliveryLabels: link.deliveryLabels,
      jiraUpdatedAt: link.deliverySourceUpdatedAt?.toISOString() ?? null,
      observedAt: link.deliveryObservedAt?.toISOString() ?? null,
      revision: link.deliveryRevision,
      connectionStatus: connection.status,
    };
  });
  return Response.json({
    items,
    connections: connections.map(connection => ({ id: connection.id, projectKey: connection.projectKey, status: connection.status, lastSyncAt: connection.lastSyncAt?.toISOString() ?? null, lastSyncStatus: connection.lastSyncStatus })),
  }, { headers: { "cache-control": "private, no-store" } });
}

export const GET = withAuthenticatedApi(handler);
