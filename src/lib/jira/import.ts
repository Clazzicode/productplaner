import type { JiraConnection, JiraExternalLink, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { saveFeature } from "@/lib/backlog/service";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { emptyRequest } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";
import { searchJiraIssues, type JiraIssueSnapshot as JiraSourceIssue } from "./client";
import { jiraHash } from "./crypto";
import { accessTokenFor } from "./oauth";

type TargetType = "feature" | "story" | "bug" | "skip";
type PreviewItem = {
  organizationId: string; externalIssueId: string; externalKey: string; issueTypeId: string; issueTypeName: string;
  targetType: TargetType; targetId: string | null; parentExternalKey: string | null; summary: string;
  sourceSnapshot: Prisma.InputJsonValue; sourceHash: string; action: "create" | "update" | "unchanged" | "conflict" | "skip";
  conflictReason: string | null; selected: boolean;
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

function storyPointsField(connection: JiraConnection) {
  const fields = connection.fieldMappings && typeof connection.fieldMappings === "object" && !Array.isArray(connection.fieldMappings) ? connection.fieldMappings as Record<string, unknown> : {};
  return typeof fields.storyPointsField === "string" ? fields.storyPointsField : "customfield_10016";
}

export async function currentTargetFingerprint(link: JiraExternalLink) {
  if (link.targetType === "feature") {
    const row = await db.capability.findUnique({ where: { id: link.targetId }, select: { name: true, description: true, backlogLane: true, backlogStatus: true, businessValue: true, riskLevel: true, backlogRevision: true } });
    return row ? fingerprint(row) : null;
  }
  if (link.targetType === "story") {
    const row = await db.artifactLayer.findUnique({ where: { id: link.targetId }, select: { title: true, body: true, points: true, readinessStatus: true, backlogRevision: true, archivedAt: true } });
    return row ? fingerprint({ ...row, archivedAt: row.archivedAt?.toISOString() ?? null }) : null;
  }
  const row = await db.bugPlanningRecord.findUnique({ where: { id: link.targetId }, include: { request: { select: { data: true } } } });
  return row ? fingerprint({ severity: row.severity, status: row.status, priority: row.priority, environment: row.environment, revision: row.revision, request: row.request.data }) : null;
}

export function sourceSnapshot(issue: JiraSourceIssue) {
  return { ...issue, descriptionText: plainText(issue.description).trim() };
}

export async function previewJiraImport(connectionId: string, actorUserId: string) {
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
  const links = await db.jiraExternalLink.findMany({ where: { connectionId } });
  const byIssue = new Map(links.map((link) => [link.externalIssueId, link]));
  const items: PreviewItem[] = [];
  for (const issue of issues) {
    const snapshot = sourceSnapshot(issue);
    const sourceHash = fingerprint(snapshot);
    const link = byIssue.get(issue.id);
    const mappedTarget = targetType(issue, connection);
    let action: "create" | "update" | "unchanged" | "conflict" | "skip" = mappedTarget === "skip" ? "skip" : link ? "update" : "create";
    let conflictReason: string | null = null;
    if (link && link.sourceHash === sourceHash) action = "unchanged";
    else if (link) {
      const current = await currentTargetFingerprint(link);
      if (!current) { action = "conflict"; conflictReason = "The linked planning record no longer exists."; }
      else if (current !== link.targetFingerprint) { action = "conflict"; conflictReason = "Both Jira and the planning record changed since the last import."; }
    }
    items.push({ organizationId: connection.organizationId, externalIssueId: issue.id, externalKey: issue.key, issueTypeId: issue.issueType.id, issueTypeName: issue.issueType.name, targetType: mappedTarget, targetId: link?.targetId ?? null, parentExternalKey: issue.parentKey, summary: issue.summary, sourceSnapshot: snapshot as unknown as Prisma.InputJsonValue, sourceHash, action, conflictReason, selected: action === "create" || action === "update" });
  }
  const sourceFingerprint = fingerprint(items.map((item) => ({ externalIssueId: item.externalIssueId, sourceHash: item.sourceHash, action: item.action })));
  return withTransaction(async () => {
    const run = await db.jiraImportRun.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId, status: "previewed", jql: `project = \"${connection.projectKey}\" ORDER BY updated ASC`, sourceCursor: null, sourceFingerprint, itemCount: items.length, createCount: items.filter((item) => item.action === "create").length, updateCount: items.filter((item) => item.action === "update").length, conflictCount: items.filter((item) => item.action === "conflict").length, unchangedCount: items.filter((item) => item.action === "unchanged").length, initiatedByUserId: actorUserId } });
    if (items.length) await db.jiraImportItem.createMany({ data: items.map((item) => ({ ...item, importRunId: run.id })) });
    await auditInitiative(connection.initiativeId!, "jira.import_previewed", { jiraImportRunId: run.id, jiraConnectionId: connection.id, itemCount: items.length, createCount: run.createCount, updateCount: run.updateCount, conflictCount: run.conflictCount, unchangedCount: run.unchangedCount });
    return loadJiraImport(run.id);
  });
}

export async function loadJiraImport(runId: string) {
  return db.jiraImportRun.findUnique({ where: { id: runId } }).then(async (run) => run ? { ...run, items: await db.jiraImportItem.findMany({ where: { importRunId: run.id }, orderBy: [{ action: "asc" }, { externalKey: "asc" }] }) } : null);
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
  if (!prototype) throw new BusinessError("Generate the roadmap before importing Jira stories.", 422);
  if (prototype.approvedAt) throw new BusinessError("Reopen the approved plan before importing Jira stories.", 409);
  let feature = await db.artifactLayer.findFirst({ where: { prototypeId: prototype.id, type: "feature", sourceCapabilityId: capabilityId, archivedAt: null } });
  if (!feature) feature = await db.artifactLayer.create({ data: { prototypeId: prototype.id, type: "feature", title, sourceCapabilityId: capabilityId, sourceType: "jira", dedupeKey: `jira-feature:${capabilityId}` } });
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
  if (!intake) throw new BusinessError("Complete guided intake before importing Jira stories.", 422);
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
  request.bug = { severity: issue.priority?.name.toLowerCase().includes("highest") ? "critical" : issue.priority?.name.toLowerCase().includes("high") ? "high" : "medium", affectedArea: issue.labels.join(", ") || "Not specified in Jira", observedBehavior: plainText(issue.description) || "See the Jira issue.", expectedBehavior: "The reported defect no longer occurs.", reproductionDetails: "See the Jira issue.", environment: "Not specified in Jira", status: issue.status.category === "done" ? "resolved" : issue.status.category === "indeterminate" ? "in_progress" : "reported" };
  return saveRequest(initiativeId, request, existing ? { id: existing.requestId, revision: existing.request.revision } : undefined, { actorUserId, changeReason: existing ? `Imported Jira update ${issue.key}` : `Imported Jira bug ${issue.key}` });
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
  const linkBase = { organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, externalIssueId: item.externalIssueId, externalKey: item.externalKey, issueTypeName: item.issueTypeName, targetType: item.targetType, targetId: target.id, sourceHash: item.sourceHash, targetFingerprint: "", sourceUpdatedAt: issue.updated ? new Date(issue.updated) : null, lastImportedSnapshot: item.sourceSnapshot as Prisma.InputJsonValue };
  const temporary = { ...linkBase, id: "", createdAt: new Date(), updatedAt: new Date(), lastImportedAt: new Date() } as JiraExternalLink;
  linkBase.targetFingerprint = (await currentTargetFingerprint(temporary)) ?? fingerprint({ id: target.id });
  await db.jiraExternalLink.upsert({ where: { connectionId_externalIssueId: { connectionId: run.connectionId, externalIssueId: item.externalIssueId } }, create: linkBase, update: { ...linkBase, lastImportedAt: new Date() } });
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
    const changed = await db.jiraImportRun.updateMany({ where: { id: run.id, status: "previewed" }, data: { status: "applying" } });
    if (changed.count !== 1) throw new BusinessError("This Jira import preview changed. Reload and try again.", 409);
    for (const item of selected) await applyItem(item, run, actorUserId);
    await db.jiraImportItem.updateMany({ where: { importRunId: run.id, status: "previewed" }, data: { status: "skipped", selected: false } });
    await db.jiraImportRun.update({ where: { id: run.id }, data: { status: "applied", appliedByUserId: actorUserId, appliedAt: new Date() } });
    await db.jiraConnection.update({ where: { id: run.connectionId }, data: { lastImportedAt: new Date() } });
    await auditInitiative(run.initiativeId, "jira.import_applied", { jiraImportRunId: run.id, selectedItemIds, importedCount: selected.length, reason });
    return loadJiraImport(run.id);
  }, { timeout: 30_000 });
}
