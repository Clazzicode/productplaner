import type { JiraConnection, JiraExternalLink, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { saveFeature } from "@/lib/backlog/service";
import { ensureFeatureProjection } from "@/lib/planning/featureIdentity";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { buildImportFieldReview, fieldBaselines } from "./fieldReview";
import { emptyRequest, requestSchema } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";
import { searchJiraIssues, type JiraIssueSnapshot as JiraSourceIssue } from "./client";
import { jiraHash } from "./crypto";
import { accessTokenFor } from "./oauth";

type TargetType = "feature" | "story" | "bug" | "skip";
type PreviewItem = {
  organizationId: string; externalIssueId: string; externalKey: string; issueTypeId: string; issueTypeName: string;
  targetType: TargetType; targetId: string | null; parentExternalKey: string | null; summary: string;
  sourceSnapshot: Prisma.InputJsonValue; sourceHash: string; action: "create" | "update" | "unchanged" | "conflict" | "skip";
  conflictReason: string | null; selected: boolean; reviewSnapshot: Prisma.InputJsonValue;
};

export function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.text === "string") return row.text;
  const content = Array.isArray(row.content) ? row.content.map(plainText).filter(Boolean) : [];
  if (row.type === "paragraph" || row.type === "heading" || row.type === "listItem") return content.join("");
  return content.join("\n");
}

export const fingerprint = (value: unknown) => jiraHash(JSON.stringify(value));

function mappings(connection: JiraConnection): Record<string, TargetType> {
  if (!connection.issueTypeMappings || typeof connection.issueTypeMappings !== "object" || Array.isArray(connection.issueTypeMappings)) return {};
  return Object.fromEntries(Object.entries(connection.issueTypeMappings).filter((entry): entry is [string, TargetType] => ["feature","story","bug","skip"].includes(String(entry[1]))));
}

function targetType(issue: JiraSourceIssue, connection: JiraConnection): TargetType {
  const configured = mappings(connection)[issue.issueType.id] ?? mappings(connection)[issue.issueType.name] ?? mappings(connection)[issue.issueType.name.toLowerCase()];
  if (configured) return configured;
  const name = issue.issueType.name.toLowerCase();
  if (name === "epic") return "feature";
  if (name === "bug" || name === "defect") return "bug";
  if (["story", "task", "user story"].includes(name)) return "story";
  return "skip";
}

function storyPointsField(connection: JiraConnection): string | null {
  const fields = connection.fieldMappings && typeof connection.fieldMappings === "object" && !Array.isArray(connection.fieldMappings) ? connection.fieldMappings as Record<string, unknown> : {};
  if (!("storyPointsField" in fields)) return "customfield_10016";
  return typeof fields.storyPointsField === "string" ? fields.storyPointsField : null;
}

export async function currentTargetSnapshot(link: Pick<JiraExternalLink, "targetType" | "targetId">) {
  if (link.targetType === "feature") {
    const row = await db.capability.findUnique({ where: { id: link.targetId }, select: { name: true, description: true, backlogLane: true, backlogStatus: true, businessValue: true, riskLevel: true, backlogRevision: true } });
    return row ?? null;
  }
  if (link.targetType === "story") {
    const row = await db.artifactLayer.findUnique({ where: { id: link.targetId }, select: { title: true, body: true, points: true, readinessStatus: true, backlogRevision: true, archivedAt: true } });
    return row ? { ...row, archivedAt: row.archivedAt?.toISOString() ?? null } : null;
  }
  const row = await db.bugPlanningRecord.findUnique({ where: { id: link.targetId }, include: { request: { select: { data: true } } } });
  return row ? { severity: row.severity, status: row.status, priority: row.priority, environment: row.environment, revision: row.revision, request: row.request.data } : null;
}

export async function currentTargetFingerprint(link: Pick<JiraExternalLink, "targetType" | "targetId">) {
  const snapshot = await currentTargetSnapshot(link);
  return snapshot ? fingerprint(snapshot) : null;
}

export function sourceSnapshot(issue: JiraSourceIssue) {
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.summary,
    description: plainText(issue.description).trim(),
    issueType: issue.issueType,
    status: issue.status,
    priority: issue.priority,
    labels: issue.labels,
    parentKey: issue.parentKey,
    storyPoints: issue.storyPoints,
    updated: issue.updated,
  };
}

export function deduplicateJiraIssues(issues: JiraSourceIssue[]) {
  const byId = new Map<string, JiraSourceIssue>();
  const byKey = new Map<string, string>();
  for (const issue of issues) {
    const priorId = byKey.get(issue.key);
    if (priorId && priorId !== issue.id) throw new BusinessError(`Jira returned two issue IDs for ${issue.key}. No import preview was saved.`, 409);
    const prior = byId.get(issue.id);
    if (prior && (prior.key !== issue.key || fingerprint(sourceSnapshot(prior)) !== fingerprint(sourceSnapshot(issue)))) {
      throw new BusinessError(`Jira returned conflicting copies of issue ${issue.id}. No import preview was saved.`, 409);
    }
    byId.set(issue.id, issue);
    byKey.set(issue.key, issue.id);
  }
  return [...byId.values()];
}

export async function previewJiraImport(connectionId: string, actorUserId: string, sourceJobId?: string, sourceEventId?: string) {
  if (sourceEventId) {
    const existing = await db.jiraImportRun.findUnique({ where: { sourceEventId } });
    if (existing) return loadJiraImport(existing.id);
  }
  if (sourceJobId) {
    const existing = await db.jiraImportRun.findUnique({ where: { sourceJobId } });
    if (existing) return loadJiraImport(existing.id);
  }
  const readStartedAt = new Date();
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (connection.status !== "connected" || !connection.initiativeId || !connection.cloudId || !connection.projectKey) throw new BusinessError("Finish selecting a Jira site, project, and initiative before importing.", 422);
  const issues: JiraSourceIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await searchJiraIssues({ cloudId: connection.cloudId, accessToken, projectKey: connection.projectKey, nextPageToken, storyPointsField: storyPointsField(connection) });
    issues.push(...result.issues);
    if (result.isLast || !result.nextPageToken) { nextPageToken = undefined; break; }
    nextPageToken = result.nextPageToken;
  }
  if (nextPageToken) throw new BusinessError("This Jira project has more than 2,000 matching issues. Narrow the import before continuing.", 422);
  const readCompletedAt = new Date();
  const uniqueIssues = deduplicateJiraIssues(issues);
  const links = await db.jiraExternalLink.findMany({ where: { connectionId } });
  const byIssue = new Map(links.map((link) => [link.externalIssueId, link]));
  const items: PreviewItem[] = [];
  for (const issue of uniqueIssues) {
    const snapshot = sourceSnapshot(issue);
    const sourceHash = fingerprint(snapshot);
    const link = byIssue.get(issue.id);
    const mappedTarget = targetType(issue, connection);
    let action: "create" | "update" | "unchanged" | "conflict" | "skip" = mappedTarget === "skip" ? "skip" : link ? "update" : "create";
    let conflictReason: string | null = null;
    const local = link ? await currentTargetSnapshot(link) : null;
    const localFingerprint = local ? fingerprint(local) : null;
    if (link && link.targetType !== mappedTarget) { action = "conflict"; conflictReason = "The reviewed issue mapping changed. Resolve the existing canonical link before importing."; }
    else if (link && link.sourceHash === sourceHash) action = "unchanged";
    else if (link) {
      const current = localFingerprint;
      if (!current) { action = "conflict"; conflictReason = "The linked planning record no longer exists."; }
      else if (current !== link.targetFingerprint) { action = "conflict"; conflictReason = "Both Jira and the planning record changed since the last import."; }
    }
    items.push({ organizationId: connection.organizationId, externalIssueId: issue.id, externalKey: issue.key, issueTypeId: issue.issueType.id, issueTypeName: issue.issueType.name, targetType: mappedTarget, targetId: link?.targetId ?? null, parentExternalKey: issue.parentKey, summary: issue.summary, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, action, conflictReason, selected: false, reviewSnapshot: buildImportFieldReview({ issue: snapshot, targetType: mappedTarget, local, targetFingerprint: localFingerprint, baselineHashes: link?.fieldBaselines, baselineAt: link?.lastImportedAt.toISOString() ?? null, localChanged: link ? localFingerprint !== link.targetFingerprint : null, remoteChanged: link ? sourceHash !== link.sourceHash : null }) as unknown as Prisma.InputJsonValue });
  }
  const sourceFingerprint = fingerprint(items.map((item) => ({ externalIssueId: item.externalIssueId, sourceHash: item.sourceHash, action: item.action })));
  try { return await withTransaction(async () => {
    const stillConnected = await db.jiraConnection.findFirst({ where: { id: connectionId, status: "connected", revision: connection.revision }, select: { id: true } });
    if (!stillConnected) throw new BusinessError("Jira was disconnected during this read. No import preview was saved.", 409);
    const run = await db.jiraImportRun.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId, connectionRevision: connection.revision, sourceJobId, sourceEventId, status: "previewed", jql: `project = \"${connection.projectKey}\" ORDER BY updated ASC`, sourceCursor: null, sourceFingerprint, readStartedAt, readCompletedAt, itemCount: items.length, createCount: items.filter((item) => item.action === "create").length, updateCount: items.filter((item) => item.action === "update").length, conflictCount: items.filter((item) => item.action === "conflict").length, unchangedCount: items.filter((item) => item.action === "unchanged").length, initiatedByUserId: actorUserId } });
    if (items.length) await db.jiraImportItem.createMany({ data: items.map((item) => ({ ...item, importRunId: run.id })) });
    for (const [action, lastSyncStatus] of [["unchanged", "unchanged"], ["update", "update_available"], ["conflict", "conflict"], ["skip", "skipped"]] as const) {
      const externalIssueIds = items.filter((item) => item.action === action && byIssue.has(item.externalIssueId)).map((item) => item.externalIssueId);
      if (externalIssueIds.length) await db.jiraExternalLink.updateMany({ where: { connectionId, externalIssueId: { in: externalIssueIds } }, data: { lastSyncStatus } });
    }
    const conflictItems = await db.jiraImportItem.findMany({ where: { importRunId: run.id, action: "conflict" } });
    for (const item of conflictItems) {
      const link = byIssue.get(item.externalIssueId);
      if (!link) continue;
      const planningFingerprint = await currentTargetFingerprint(link);
      if (!planningFingerprint) continue;
      const existing = await db.jiraSyncConflict.findFirst({ where: { connectionId: connection.id, externalIssueId: item.externalIssueId, jiraFingerprint: item.sourceHash, planningFingerprint, status: "open" } });
      const conflictUpdate = { importItemId: item.id, explanation: item.conflictReason ?? "Jira and Clarivia changed since the last synchronization." };
      if (existing) await db.jiraSyncConflict.update({ where: { id: existing.id }, data: conflictUpdate });
      else await db.jiraSyncConflict.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId: connection.id, externalLinkId: link.id, targetType: link.targetType, targetId: link.targetId, externalIssueId: link.externalIssueId, externalKey: link.externalKey, baselineSourceHash: link.sourceHash, baselineTargetHash: link.targetFingerprint, jiraFingerprint: item.sourceHash, planningFingerprint, jiraSnapshot: item.sourceSnapshot as Prisma.InputJsonValue, ...conflictUpdate } });
    }
    await db.jiraConnection.update({ where: { id: connection.id }, data: { lastSyncAt: readCompletedAt, lastSyncStatus: "read_complete" } });
    await auditInitiative(connection.initiativeId!, "jira.import_previewed", { jiraImportRunId: run.id, jiraJobId: sourceJobId ?? null, jiraWebhookEventId: sourceEventId ?? null, jiraConnectionId: connection.id, workspaceId: connection.organizationId, source: "jira", cloudId: connection.cloudId, projectKey: connection.projectKey, readStartedAt: readStartedAt.toISOString(), readCompletedAt: readCompletedAt.toISOString(), receivedCount: issues.length, duplicateCount: issues.length - uniqueIssues.length, itemCount: items.length, createCount: run.createCount, updateCount: run.updateCount, conflictCount: run.conflictCount, unchangedCount: run.unchangedCount });
    return loadJiraImport(run.id);
  }); } catch (error) {
    if ((sourceJobId || sourceEventId) && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = sourceEventId ? await db.jiraImportRun.findUnique({ where: { sourceEventId } }) : await db.jiraImportRun.findUnique({ where: { sourceJobId: sourceJobId! } });
      if (existing) return loadJiraImport(existing.id);
    }
    throw error;
  }
}

export async function loadJiraImport(runId: string) {
  return db.jiraImportRun.findUnique({ where: { id: runId }, select: { id: true, connectionId: true, status: true, itemCount: true, createCount: true, updateCount: true, conflictCount: true, unchangedCount: true, appliedAt: true, readCompletedAt: true, connectionRevision: true, createdAt: true, updatedAt: true } }).then(async (run) => run ? { ...run, items: await db.jiraImportItem.findMany({ where: { importRunId: run.id }, orderBy: [{ action: "asc" }, { externalKey: "asc" }], select: { id: true, externalKey: true, issueTypeName: true, targetType: true, targetId: true, reviewSnapshot: true, summary: true, action: true, conflictReason: true, selected: true, status: true, createdAt: true, updatedAt: true } }) } : null);
}

async function importedFeature(issue: JiraSourceIssue, initiativeId: string, existingId?: string | null) {
  if (existingId) {
    const row = await db.capability.findUnique({ where: { id: existingId }, include: { dependsOnEdges: { select: { toCapabilityId: true } } } });
    if (!row) throw new BusinessError("The linked feature no longer exists.", 409);
    return saveFeature(initiativeId, { name: issue.summary, description: plainText(issue.description), backlogLane: row.backlogLane as "now"|"next"|"later"|"unscheduled", backlogStatus: row.backlogStatus as "planned"|"in_progress"|"ready_for_review"|"done"|"archived", ownerUserId: row.ownerUserId, isMvp: row.isMvp, businessValue: row.businessValue as "very_low"|"low"|"medium"|"high"|"critical", riskLevel: row.riskLevel as "low"|"medium"|"high"|"critical", dependsOnIds: row.dependsOnEdges.map((edge) => edge.toCapabilityId) }, { id: row.id, revision: row.backlogRevision }, { reason: `Imported Jira update ${issue.key}` });
  }
  return saveFeature(initiativeId, { name: issue.summary, description: plainText(issue.description), backlogLane: "unscheduled", backlogStatus: "planned", ownerUserId: null, isMvp: false, businessValue: "medium", riskLevel: "medium", dependsOnIds: [] });
}

async function epicForCapability(initiativeId: string, capabilityId: string, title: string) {
  const prototype = await db.prototype.findUnique({ where: { initiativeId } });
  if (!prototype) throw new BusinessError("Start the planning workspace before importing Jira stories.", 422);
  if (prototype.approvedAt) throw new BusinessError("Reopen the approved plan before importing Jira stories.", 409);
  const feature = await ensureFeatureProjection(initiativeId, capabilityId, "jira");
  let epic = await db.artifactLayer.findFirst({ where: { parentId: feature.id, type: "epic", archivedAt: null } });
  if (!epic) epic = await db.artifactLayer.create({ data: { prototypeId: prototype.id, type: "epic", parentId: feature.id, title: `${title} delivery`, sourceCapabilityId: capabilityId, sourceType: "jira", dedupeKey: `jira-epic:${capabilityId}` } });
  return epic;
}

async function storyCapability(connectionId: string, initiativeId: string, parentExternalKey: string | null) {
  if (parentExternalKey) {
    const link = await db.jiraExternalLink.findFirst({ where: { connectionId, externalKey: parentExternalKey, targetType: "feature" } });
    if (link) return db.capability.findUnique({ where: { id: link.targetId } });
  }
  const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId } });
  if (!intake) throw new BusinessError("Save an initiative draft before importing Jira stories.", 422);
  let capability = await db.capability.findFirst({ where: { intakeAnswerSetId: intake.id, backlogKey: "jira-imported-stories" } });
  if (!capability) {
    const max = await db.capability.aggregate({ where: { intakeAnswerSetId: intake.id }, _max: { order: true } });
    capability = await db.capability.create({ data: { intakeAnswerSetId: intake.id, backlogKey: "jira-imported-stories", name: "Jira imported stories", description: "Stories imported from Jira that were not linked to an imported epic.", isMvp: false, effortSize: "m", businessValue: "medium", riskLevel: "medium", backlogLane: "unscheduled", order: (max._max.order ?? -1) + 1 } });
  }
  return capability;
}

async function importedStory(issue: JiraSourceIssue, connectionId: string, initiativeId: string, existingId?: string | null) {
  if (existingId) {
    const current = await db.artifactLayer.findUnique({ where: { id: existingId } });
    if (!current) throw new BusinessError("The linked story no longer exists.", 409);
    const prototype = await db.prototype.findUnique({ where: { id: current.prototypeId }, select: { approvedAt: true } });
    if (prototype?.approvedAt) throw new BusinessError("Reopen the approved plan before importing Jira story updates.", 409);
    const next = { title: issue.summary, body: plainText(issue.description) || `Imported from Jira ${issue.key}.`, points: issue.storyPoints ? Math.min(21, Math.max(1, Math.round(issue.storyPoints))) : null, backlogRevision: current.backlogRevision + 1 };
    await db.artifactRevision.create({ data: { artifactId: current.id, version: next.backlogRevision, title: next.title, body: next.body, reason: `Imported Jira update ${issue.key}`, metadata: { source: "jira", externalKey: issue.key } } });
    return db.artifactLayer.update({ where: { id: current.id }, data: { title: next.title, body: next.body, points: next.points, backlogRevision: { increment: 1 } } });
  }
  const capability = await storyCapability(connectionId, initiativeId, issue.parentKey);
  if (!capability) throw new BusinessError("Choose a feature for the imported Jira story.", 422);
  const epic = await epicForCapability(initiativeId, capability.id, capability.name);
  const duplicate = await db.artifactLayer.findFirst({ where: { prototypeId: epic.prototypeId, type: "story", externalRef: issue.key } });
  if (duplicate) throw new BusinessError(`Jira story ${issue.key} is already imported.`, 409);
  const order = await db.artifactLayer.count({ where: { parentId: epic.id, type: "story" } });
  return db.artifactLayer.create({ data: { prototypeId: epic.prototypeId, type: "story", parentId: epic.id, order, title: issue.summary, body: plainText(issue.description) || `Imported from Jira ${issue.key}.`, points: issue.storyPoints ? Math.min(21, Math.max(1, Math.round(issue.storyPoints))) : null, sourceCapabilityId: capability.id, sourceType: "jira", externalRef: issue.key, dedupeKey: `jira:${issue.id}`, readinessStatus: "needs_refinement", traceNote: `Imported from Jira ${issue.key}.` } });
}

async function importedBug(issue: JiraSourceIssue, initiativeId: string, actorUserId: string, existingId?: string | null) {
  const existing = existingId ? await db.bugPlanningRecord.findUnique({ where: { id: existingId }, include: { request: true } }) : null;
  if (existingId && !existing) throw new BusinessError("The linked bug no longer exists.", 409);
  if (existing) {
    const request = requestSchema.parse(existing.request.data);
    request.title = issue.summary;
    request.problem = plainText(issue.description) || `Bug reported in Jira as ${issue.key}.`;
    request.bug.observedBehavior = plainText(issue.description) || "See the Jira issue.";
    return saveRequest(initiativeId, request, { id: existing.requestId, revision: existing.request.revision }, { actorUserId, changeReason: `Imported Jira update ${issue.key}` });
  }
  const request = emptyRequest();
  request.title = issue.summary;
  request.kind = "bug";
  request.source = "jira";
  request.sourceReference = issue.key;
  request.requestor = "Jira import";
  request.problem = plainText(issue.description) || `Bug reported in Jira as ${issue.key}.`;
  request.requestedChange = "Investigate and resolve the behavior recorded in Jira.";
  request.outcome = "The Jira issue is resolved and validated.";
  request.businessRules = "Preserve Jira traceability.";
  request.dependencies = "Review linked Jira work.";
  request.bug = { severity: "medium", affectedArea: issue.labels.join(", ") || "Not specified in Jira", observedBehavior: plainText(issue.description) || "See the Jira issue.", expectedBehavior: "The reported defect no longer occurs.", reproductionDetails: "See the Jira issue.", environment: "Not specified in Jira", status: "reported" };
  return saveRequest(initiativeId, request, undefined, { actorUserId, changeReason: `Imported Jira bug ${issue.key}` });
}

async function applyItem(item: { id: string; targetType: string; targetId: string | null; sourceSnapshot: Prisma.JsonValue; sourceHash: string; externalIssueId: string; externalKey: string; issueTypeName: string }, run: { connectionId: string; initiativeId: string; organizationId: string }, actorUserId: string) {
  const issue = item.sourceSnapshot as unknown as JiraSourceIssue;
  let target: { id: string };
  if (item.targetType === "feature") target = await importedFeature(issue, run.initiativeId, item.targetId);
  else if (item.targetType === "story") target = await importedStory(issue, run.connectionId, run.initiativeId, item.targetId);
  else if (item.targetType === "bug") {
    const request = await importedBug(issue, run.initiativeId, actorUserId, item.targetId);
    target = await db.bugPlanningRecord.findUniqueOrThrow({ where: { requestId: request.id } });
  } else throw new BusinessError("Skipped Jira items cannot be imported.", 422);
  const linkBase = { organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, externalIssueId: item.externalIssueId, externalKey: item.externalKey, issueTypeName: item.issueTypeName, targetType: item.targetType, targetId: target.id, sourceHash: item.sourceHash, targetFingerprint: "", sourceUpdatedAt: issue.updated ? new Date(issue.updated) : null, lastImportedSnapshot: {} as Prisma.InputJsonValue, lastSyncStatus: "imported" };
  const temporary = { ...linkBase, id: "", createdAt: new Date(), updatedAt: new Date(), lastImportedAt: new Date() } as JiraExternalLink;
  const local = await currentTargetSnapshot(temporary);
  linkBase.targetFingerprint = local ? fingerprint(local) : fingerprint({ id: target.id });
  const baselines = fieldBaselines(issue, item.targetType, local) as unknown as Prisma.InputJsonValue;
  await db.jiraExternalLink.upsert({ where: { connectionId_externalIssueId: { connectionId: run.connectionId, externalIssueId: item.externalIssueId } }, create: { ...linkBase, fieldBaselines: baselines }, update: { ...linkBase, fieldBaselines: baselines, lastImportedAt: new Date() } });
  await db.jiraImportItem.update({ where: { id: item.id }, data: { targetId: target.id, status: "imported" } });
}

export async function applyJiraImport(runId: string, selectedItemIds: string[], reason: string, actorUserId: string) {
  return withTransaction(async () => {
    const run = await db.jiraImportRun.findUnique({ where: { id: runId } });
    if (!run) throw new BusinessError("Jira import preview not found.", 404);
    if (run.status !== "previewed") throw new BusinessError("This Jira import preview has already been finalized.", 409);
    const selected = await db.jiraImportItem.findMany({ where: { importRunId: run.id, id: { in: selectedItemIds } } });
    if (selected.length !== new Set(selectedItemIds).size) throw new BusinessError("One or more selected Jira items are invalid.", 422);
    if (selected.some((item) => !["create","update"].includes(item.action))) throw new BusinessError("Resolve conflicts and exclude unchanged or skipped items before importing.", 422);
    if (!selected.length) throw new BusinessError("Select at least one create or update.", 422);
    await requireCollaborationAction(run.initiativeId, actorUserId, "manage_integrations", run.organizationId);
    const connection = await db.jiraConnection.findUnique({ where: { id: run.connectionId } });
    if (!connection || connection.status !== "connected" || run.connectionRevision === null || connection.revision !== run.connectionRevision) {
      throw new BusinessError("The Jira connection changed. Refresh the preview before importing.", 409);
    }
    for (const item of selected) {
      const review = item.reviewSnapshot as { schemaVersion?: number; targetFingerprint?: string | null } | null;
      if (review?.schemaVersion !== 1) throw new BusinessError("Refresh this legacy import preview before applying it.", 409);
      const current = item.targetId ? await currentTargetFingerprint({ targetType: item.targetType, targetId: item.targetId }) : null;
      if (current !== review.targetFingerprint) throw new BusinessError(`${item.externalKey} changed locally after review. Refresh the preview.`, 409);
      const link = await db.jiraExternalLink.findUnique({ where: { connectionId_externalIssueId: { connectionId: run.connectionId, externalIssueId: item.externalIssueId } } });
      if ((item.action === "create" && link) || (item.action === "update" && (!link || link.targetId !== item.targetId || link.targetType !== item.targetType))) {
        throw new BusinessError("The canonical Jira mapping changed. Refresh the preview.", 409);
      }
    }
    const changed = await db.jiraImportRun.updateMany({ where: { id: run.id, status: "previewed" }, data: { status: "applying" } });
    if (changed.count !== 1) throw new BusinessError("This Jira import preview changed. Reload and try again.", 409);
    for (const item of selected) await applyItem(item, run, actorUserId);
    await db.jiraImportItem.updateMany({ where: { importRunId: run.id, status: "previewed" }, data: { status: "skipped", selected: false } });
    await db.jiraImportRun.update({ where: { id: run.id }, data: { status: "applied", appliedByUserId: actorUserId, appliedAt: new Date() } });
    await db.jiraConnection.update({ where: { id: run.connectionId }, data: { lastImportedAt: new Date(), lastSyncAt: new Date(), lastSyncStatus: "applied" } });
    await auditInitiative(run.initiativeId, "jira.import_applied", { jiraImportRunId: run.id, jiraConnectionId: run.connectionId, workspaceId: run.organizationId, source: "jira", selectedItemIds, importedCount: selected.length, reason });
    return loadJiraImport(run.id);
  }, { timeout: 30_000 });
}
