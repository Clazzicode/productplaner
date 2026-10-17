import type { JiraExternalLink, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { getJiraIssue } from "./client";
import { currentTargetFingerprint, fingerprint, sourceSnapshot } from "./import";
import { accessTokenFor } from "./oauth";

export async function recordJiraConflict(input: { link: JiraExternalLink; jiraSnapshot: Prisma.InputJsonValue; jiraFingerprint: string; planningFingerprint: string; importItemId?: string; exportItemId?: string; explanation: string }) {
  const existing = await db.jiraSyncConflict.findFirst({ where: { connectionId: input.link.connectionId, externalIssueId: input.link.externalIssueId, jiraFingerprint: input.jiraFingerprint, planningFingerprint: input.planningFingerprint, status: "open" } });
  if (existing) return db.jiraSyncConflict.update({ where: { id: existing.id }, data: { importItemId: input.importItemId, exportItemId: input.exportItemId, explanation: input.explanation } });
  return db.jiraSyncConflict.create({ data: { organizationId: input.link.organizationId, initiativeId: input.link.initiativeId, connectionId: input.link.connectionId, externalLinkId: input.link.id, importItemId: input.importItemId, exportItemId: input.exportItemId, targetType: input.link.targetType, targetId: input.link.targetId, externalIssueId: input.link.externalIssueId, externalKey: input.link.externalKey, baselineSourceHash: input.link.sourceHash, baselineTargetHash: input.link.targetFingerprint, jiraFingerprint: input.jiraFingerprint, planningFingerprint: input.planningFingerprint, jiraSnapshot: input.jiraSnapshot, explanation: input.explanation } });
}

export async function recordExportExecutionConflict(exportItemId: string, explanation: string) {
  const item = await db.jiraExportItem.findUnique({ where: { id: exportItemId } });
  if (!item?.externalIssueId) return null;
  const run = await db.jiraExportRun.findUniqueOrThrow({ where: { id: item.exportRunId } });
  const link = await db.jiraExternalLink.findFirst({ where: { connectionId: run.connectionId, targetType: item.targetType, targetId: item.targetId } });
  if (!link) return null;
  const { connection, accessToken } = await accessTokenFor(run.connectionId);
  if (!connection.cloudId) return null;
  const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: item.externalIssueId });
  const jiraSnapshot = sourceSnapshot(remote) as unknown as Prisma.InputJsonValue;
  const planningFingerprint = await currentTargetFingerprint(link);
  if (!planningFingerprint) return null;
  return recordJiraConflict({ link, jiraSnapshot, jiraFingerprint: fingerprint(jiraSnapshot), planningFingerprint, exportItemId: item.id, explanation });
}

export async function resolveJiraConflict(conflictId: string, resolution: "keep_planning" | "accept_jira" | "manual", reason: string, actorUserId: string) {
  const conflict = await db.jiraSyncConflict.findUnique({ where: { id: conflictId } });
  if (!conflict) throw new BusinessError("Jira conflict not found.", 404);
  if (conflict.status !== "open") throw new BusinessError("This Jira conflict is already resolved.", 409);
  const link = await db.jiraExternalLink.findUnique({ where: { id: conflict.externalLinkId } });
  if (!link) throw new BusinessError("The Jira link no longer exists.", 409);
  const { connection, accessToken } = await accessTokenFor(conflict.connectionId);
  if (!connection.cloudId) throw new BusinessError("The Jira connection is incomplete.", 422);
  const currentPlanning = await currentTargetFingerprint(link);
  if (!currentPlanning) throw new BusinessError("The planning record no longer exists.", 409);
  const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: conflict.externalIssueId });
  const remoteSnapshot = sourceSnapshot(remote) as unknown as Prisma.InputJsonValue;
  const currentJira = fingerprint(remoteSnapshot);
  if (resolution !== "manual" && (currentPlanning !== conflict.planningFingerprint || currentJira !== conflict.jiraFingerprint)) throw new BusinessError("Jira or the planning record changed again. Create a fresh preview before resolving.", 409);
  return withTransaction(async () => {
    const linkData = resolution === "keep_planning"
      ? { sourceHash: currentJira, lastImportedSnapshot: remoteSnapshot, sourceUpdatedAt: remote.updated ? new Date(remote.updated) : null }
      : resolution === "accept_jira"
        ? { targetFingerprint: currentPlanning }
        : { sourceHash: currentJira, targetFingerprint: currentPlanning, lastImportedSnapshot: remoteSnapshot, sourceUpdatedAt: remote.updated ? new Date(remote.updated) : null };
    await db.jiraExternalLink.update({ where: { id: link.id }, data: { ...linkData, lastImportedAt: new Date() } });
    const changed = await db.jiraSyncConflict.updateMany({ where: { id: conflict.id, status: "open" }, data: { status: "resolved", resolution, resolutionReason: reason, resolvedByUserId: actorUserId, resolvedAt: new Date() } });
    if (changed.count !== 1) throw new BusinessError("This Jira conflict changed. Reload and try again.", 409);
    await auditInitiative(conflict.initiativeId, "jira.conflict_resolved", { jiraSyncConflictId: conflict.id, externalKey: conflict.externalKey, resolution, reason });
    return db.jiraSyncConflict.findUniqueOrThrow({ where: { id: conflict.id } });
  });
}
