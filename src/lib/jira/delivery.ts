import type { JiraExternalLink, Prisma } from "@prisma/client";
import { db, withTransaction } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { getJiraIssue, type JiraIssueSnapshot } from "./client";
import { accessTokenFor } from "./oauth";

type DeliveryStatus = "planned" | "in_progress" | "done" | "blocked";
type DeliverySnapshot = Pick<JiraIssueSnapshot, "id" | "key" | "projectId" | "projectKey" | "status" | "priority" | "labels" | "parentKey" | "updated">;

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const deliveryStatuses = new Set<DeliveryStatus>(["planned", "in_progress", "done", "blocked"]);

export function mappedJiraDeliveryStatus(issue: DeliverySnapshot, fieldMappings: unknown): DeliveryStatus | null {
  const configured = object(object(fieldMappings).statusMappings);
  const mapped = configured[issue.status.id] ?? configured[issue.status.name];
  if (typeof mapped === "string" && deliveryStatuses.has(mapped as DeliveryStatus)) return mapped as DeliveryStatus;
  if (issue.status.category === "done") return "done";
  if (issue.status.category === "indeterminate") return "in_progress";
  if (issue.status.category === "new") return "planned";
  return null;
}

export function deliveryChanged(link: JiraExternalLink, issue: DeliverySnapshot, mappedStatus: DeliveryStatus | null): boolean {
  return link.externalKey !== issue.key
    || link.deliveryStatusId !== issue.status.id
    || link.deliveryStatusName !== issue.status.name
    || link.deliveryStatusCategory !== issue.status.category
    || link.deliveryMappedStatus !== mappedStatus
    || link.deliveryPriorityId !== (issue.priority?.id ?? null)
    || link.deliveryPriorityName !== (issue.priority?.name ?? null)
    || JSON.stringify(link.deliveryLabels) !== JSON.stringify(issue.labels)
    || link.deliveryParentKey !== issue.parentKey
    || (link.deliverySourceUpdatedAt?.toISOString() ?? null) !== (issue.updated ? new Date(issue.updated).toISOString() : null);
}

export async function applyJiraDeliverySnapshot(connectionId: string, issue: DeliverySnapshot, projectId: string | null, projectKey: string | null, fieldMappings: unknown) {
  if (projectId && issue.projectId && projectId !== issue.projectId) throw new BusinessError("The linked Jira issue moved to another project. Review its mapping.", 409);
  if (projectKey && issue.projectKey && projectKey !== issue.projectKey) throw new BusinessError("The linked Jira issue moved to another project. Review its mapping.", 409);
  const link = await db.jiraExternalLink.findFirst({ where: { connectionId, externalIssueId: issue.id } });
  if (!link) return { updated: false, reason: "unlinked" as const };
  const sourceUpdatedAt = issue.updated ? new Date(issue.updated) : null;
  if (sourceUpdatedAt && Number.isNaN(sourceUpdatedAt.getTime())) throw new BusinessError("Jira returned an invalid issue update time.", 422);
  if (sourceUpdatedAt && link.deliverySourceUpdatedAt && sourceUpdatedAt < link.deliverySourceUpdatedAt) return { updated: false, reason: "older" as const };
  const mappedStatus = mappedJiraDeliveryStatus(issue, fieldMappings);
  if (!deliveryChanged(link, issue, mappedStatus)) {
    await db.jiraExternalLink.updateMany({ where: { id: link.id, deliveryRevision: link.deliveryRevision }, data: { deliveryCheckedAt: new Date() } });
    return { updated: false, reason: "unchanged" as const };
  }
  const result = await withTransaction(async () => {
    const changed = await db.jiraExternalLink.updateMany({
    where: { id: link.id, deliveryRevision: link.deliveryRevision, ...(sourceUpdatedAt ? { OR: [{ deliverySourceUpdatedAt: null }, { deliverySourceUpdatedAt: { lte: sourceUpdatedAt } }] } : {}) },
    data: {
      externalKey: issue.key,
      deliveryStatusId: issue.status.id,
      deliveryStatusName: issue.status.name,
      deliveryStatusCategory: issue.status.category,
      deliveryMappedStatus: mappedStatus,
      deliveryPriorityId: issue.priority?.id ?? null,
      deliveryPriorityName: issue.priority?.name ?? null,
      deliveryLabels: issue.labels as Prisma.InputJsonValue,
      deliveryParentKey: issue.parentKey,
      deliverySourceUpdatedAt: sourceUpdatedAt,
      deliveryObservedAt: new Date(),
      deliveryCheckedAt: new Date(),
      deliveryRevision: { increment: 1 },
    },
    });
    if (changed.count === 1) await auditInitiative(link.initiativeId, "jira.delivery_updated", { jiraConnectionId: connectionId, jiraIssueId: issue.id, jiraIssueKey: issue.key, targetType: link.targetType, targetId: link.targetId, previousStatus: link.deliveryStatusName, currentStatus: issue.status.name, mappedStatus, jiraUpdatedAt: issue.updated });
    return changed;
  });
  return { updated: result.count === 1, reason: result.count === 1 ? "updated" as const : "raced" as const };
}

export async function refreshJiraDeliveryIssue(connectionId: string, externalIssueId: string) {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (connection.status !== "connected" || !connection.cloudId || !connection.projectId || !connection.projectKey) throw new BusinessError("The Jira connection is incomplete.", 422);
  const issue = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: externalIssueId });
  if (issue.id !== externalIssueId) throw new BusinessError("Jira returned a different issue identity.", 409);
  const result = await applyJiraDeliverySnapshot(connection.id, issue, connection.projectId, connection.projectKey, connection.fieldMappings);
  if (result.reason !== "unlinked") await db.jiraConnection.updateMany({ where: { id: connection.id, status: "connected" }, data: { lastSyncAt: new Date(), lastSyncStatus: "delivery_read_complete" } });
  return result;
}
