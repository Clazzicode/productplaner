import type { JiraExternalLink, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { createJiraIssue, getJiraIssue, updateJiraIssue } from "./client";
import { jiraHash } from "./crypto";
import { currentTargetFingerprint, exportSourceFingerprint, fingerprint, importSourceFingerprint, sourceSnapshot } from "./import";
import { accessTokenFor } from "./oauth";
import { recordJiraConflict } from "./conflicts";
import { applyJiraDeliverySnapshot } from "./delivery";

type TargetType = "feature" | "story" | "bug";
type ExportPayload = { fields: Record<string, unknown> };
type Candidate = { targetType: TargetType; targetId: string; summary: string; description: string; issueType: string; targetFingerprint: string };
type PreviewExportItem = { organizationId: string; targetType: TargetType; targetId: string; summary: string; externalIssueId: string | null; externalKey: string | null; action: "create" | "update" | "unchanged" | "conflict"; requestPayload: Prisma.InputJsonValue; reviewSnapshot: Prisma.InputJsonValue; targetFingerprint: string; expectedSourceHash: string | null; idempotencyKey: string; conflictReason: string | null; selected: boolean; status: string };

const adf = (value: string) => ({ type: "doc", version: 1, content: value.split(/\n+/).filter(Boolean).map((text) => ({ type: "paragraph", content: [{ type: "text", text: text.slice(0, 32000) }] })) });
const dataObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown) => typeof value === "string" ? value : "";
export { exportSourceFingerprint } from "./import";

export function fieldsFor(candidate: Pick<Candidate, "summary" | "description" | "issueType">, projectId: string, update = false, issueTypeId?: string | null): ExportPayload {
  return { fields: { ...(update ? {} : { project: { id: projectId }, issuetype: issueTypeId ? { id: issueTypeId } : { name: candidate.issueType } }), summary: candidate.summary, description: adf(candidate.description || candidate.summary) } };
}

export function assertFrozenJiraTarget(reviewSnapshot: unknown, connection: { cloudId: string; projectId: string }) {
  const frozen = dataObject(dataObject(reviewSnapshot).target);
  if (frozen.cloudId !== connection.cloudId || frozen.projectId !== connection.projectId) throw new BusinessError("The Jira site or project changed after approval. Create a new export preview.", 409);
}

export function assertJiraIssueProject(issue: { projectId?: string | null; projectKey?: string | null }, connection: { projectId: string; projectKey: string | null }) {
  if (issue.projectId !== connection.projectId || connection.projectKey && issue.projectKey !== connection.projectKey) throw new BusinessError("The linked Jira issue moved to another project. Resolve the mapping before exporting.", 409);
}

async function candidates(initiativeId: string): Promise<Candidate[]> {
  const [features, stories, bugs] = await Promise.all([
    db.capability.findMany({ where: { intakeAnswerSet: { initiativeId }, backlogStatus: { not: "archived" } }, select: { id: true, name: true, description: true, backlogLane: true, backlogStatus: true, businessValue: true, riskLevel: true, backlogRevision: true }, orderBy: { order: "asc" } }),
    db.artifactLayer.findMany({ where: { prototype: { initiativeId }, type: "story", archivedAt: null }, include: { children: { where: { type: "acceptance_criterion", archivedAt: null }, orderBy: { order: "asc" }, select: { title: true, body: true } } }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    db.bugPlanningRecord.findMany({ where: { initiativeId, archivedAt: null }, include: { request: { select: { data: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return [
    ...features.map((row) => ({ targetType: "feature" as const, targetId: row.id, summary: row.name, description: row.description, issueType: "Epic", targetFingerprint: fingerprint({ name: row.name, description: row.description, backlogLane: row.backlogLane, backlogStatus: row.backlogStatus, businessValue: row.businessValue, riskLevel: row.riskLevel, backlogRevision: row.backlogRevision }) })),
    ...stories.map((row) => ({ targetType: "story" as const, targetId: row.id, summary: row.title, description: `${row.body}${row.children.length ? `\n\nAcceptance criteria\n${row.children.map((item, index) => `${index + 1}. ${item.title}${item.body ? ` — ${item.body}` : ""}`).join("\n")}` : ""}`, issueType: "Story", targetFingerprint: fingerprint({ title: row.title, body: row.body, points: row.points, readinessStatus: row.readinessStatus, backlogRevision: row.backlogRevision, archivedAt: row.archivedAt?.toISOString() ?? null }) })),
    ...bugs.map((row) => { const request = dataObject(row.request.data); const bug = dataObject(request.bug); return { targetType: "bug" as const, targetId: row.id, summary: stringValue(request.title) || "Planning bug", description: [stringValue(request.problem), `Observed: ${stringValue(bug.observedBehavior)}`, `Expected: ${stringValue(bug.expectedBehavior)}`, `Reproduction: ${stringValue(bug.reproductionDetails)}`, `Environment: ${row.environment}`].filter(Boolean).join("\n"), issueType: "Bug", targetFingerprint: fingerprint({ severity: row.severity, status: row.status, priority: row.priority, environment: row.environment, revision: row.revision, request: row.request.data }) }; }),
  ];
}

export function approvalHash(items: { id: string; targetFingerprint: string; requestPayload: Prisma.JsonValue; reviewSnapshot?: Prisma.JsonValue }[]) {
  return fingerprint([...items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({ id: item.id, targetFingerprint: item.targetFingerprint, requestPayload: item.requestPayload, reviewSnapshot: item.reviewSnapshot ?? null })));
}

export async function loadJiraExport(runId: string) {
  const run = await db.jiraExportRun.findUnique({ where: { id: runId }, select: { id: true, connectionId: true, status: true, itemCount: true, createCount: true, updateCount: true, conflictCount: true, unchangedCount: true, executedAt: true, createdAt: true, updatedAt: true } });
  if (!run) return null;
  const [items, approval] = await Promise.all([
    db.jiraExportItem.findMany({ where: { exportRunId: run.id }, orderBy: [{ action: "asc" }, { summary: "asc" }], select: { id: true, externalKey: true, targetType: true, targetId: true, externalIssueId: true, createAttemptedAt: true, requestPayload: true, reviewSnapshot: true, summary: true, action: true, conflictReason: true, selected: true, status: true, failureMessage: true, createdAt: true, updatedAt: true } }),
    db.jiraExportApproval.findUnique({ where: { exportRunId: run.id }, select: { id: true, approvedAt: true, approvedByUserId: true } }),
  ]);
  return { ...run, items, approval };
}

export async function previewJiraExport(connectionId: string, actorUserId: string) {
  if (process.env.JIRA_WRITE_ENABLED !== "true") throw new BusinessError("Jira exports are disabled while this connection is read-only.", 403);
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (connection.status !== "connected" || !connection.initiativeId || !connection.cloudId || !connection.projectId) throw new BusinessError("Finish selecting a Jira site, project, and initiative before exporting.", 422);
  if (!connection.scopes.split(/\s+/).includes("write:jira-work")) throw new BusinessError("Reconnect Jira and grant write access before creating an export preview.", 422);
  const local = await candidates(connection.initiativeId);
  const outboundIssueTypeIds = dataObject(dataObject(connection.fieldMappings).outboundIssueTypeIds);
  const links = await db.jiraExternalLink.findMany({ where: { connectionId } });
  const earlierRuns = await db.jiraExportRun.findMany({ where: { connectionId }, select: { id: true } });
  const uncertainCreates = earlierRuns.length ? await db.jiraExportItem.findMany({ where: { exportRunId: { in: earlierRuns.map(run => run.id) }, action: "create", createAttemptedAt: { not: null }, externalIssueId: null }, select: { targetType: true, targetId: true } }) : [];
  const uncertainTargets = new Set(uncertainCreates.map(item => `${item.targetType}:${item.targetId}`));
  const byTarget = new Map(links.map((link) => [`${link.targetType}:${link.targetId}`, link]));
  const conflictEvidence = new Map<string, { link: JiraExternalLink; snapshot: Prisma.InputJsonValue; jiraFingerprint: string }>();
  const items: PreviewExportItem[] = [];
  for (const candidate of local) {
    const link = byTarget.get(`${candidate.targetType}:${candidate.targetId}`);
    let action: "create" | "update" | "unchanged" | "conflict" = link ? "update" : "create";
    let conflictReason: string | null = null;
    let before: unknown = null;
    let expectedSourceHash: string | null = link?.exportSourceHash ?? null;
    const issueTypeId = stringValue(outboundIssueTypeIds[candidate.targetType]);
    if (!link && !issueTypeId) {
      action = "conflict";
      conflictReason = `No reviewed outbound Jira issue type is selected for ${candidate.targetType}. Configure the project mapping first.`;
    }
    if (!link && uncertainTargets.has(`${candidate.targetType}:${candidate.targetId}`)) {
      action = "conflict";
      conflictReason = "A prior Jira create may have succeeded. Verify the issue in Jira and reconcile its link before exporting again.";
    }
    if (link && candidate.targetFingerprint === link.targetFingerprint) action = "unchanged";
    else if (link) {
      try {
        const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: link.externalIssueId });
        const snapshot = sourceSnapshot(remote) as unknown as Prisma.InputJsonValue;
        before = { summary: remote.summary, description: dataObject(snapshot).description ?? null };
        const currentSourceHash = exportSourceFingerprint(remote);
        if (!link.exportSourceHash || currentSourceHash !== link.exportSourceHash) { action = "conflict"; conflictReason = link.exportSourceHash ? "Both Jira and the planning record changed since the last synchronization." : "No outbound field baseline exists for this linked issue. Review its current Jira fields before exporting."; }
        expectedSourceHash = currentSourceHash;
        if (action === "conflict") conflictEvidence.set(candidate.targetId, { link, snapshot, jiraFingerprint: currentSourceHash });
      } catch (error) { action = "conflict"; conflictReason = error instanceof Error ? `Could not verify Jira: ${error.message}` : "Could not verify the linked Jira issue."; }
    }
    const payload = fieldsFor(candidate, connection.projectId, Boolean(link), issueTypeId);
    const reviewSnapshot = { schemaVersion: 1, target: { cloudId: connection.cloudId, projectId: connection.projectId, issueTypeId: issueTypeId || null, externalIssueId: link?.externalIssueId ?? null, externalKey: link?.externalKey ?? null, localType: candidate.targetType, localId: candidate.targetId }, before, proposed: payload.fields, omissions: ["Jira status transitions", "priority", "assignee", "labels", "sprint/release assignments", "deletions", ...(link ? ["project move", "issue type change"] : [])], note: action === "unchanged" ? "No write proposed; current remote values were not reread." : "Only the frozen fields are eligible for a future approved write." };
    items.push({ organizationId: connection.organizationId, targetType: candidate.targetType, targetId: candidate.targetId, summary: candidate.summary, externalIssueId: link?.externalIssueId ?? null, externalKey: link?.externalKey ?? null, action, requestPayload: payload as unknown as Prisma.InputJsonValue, reviewSnapshot: reviewSnapshot as unknown as Prisma.InputJsonValue, targetFingerprint: candidate.targetFingerprint, expectedSourceHash, idempotencyKey: jiraHash(`${connection.id}:${candidate.targetType}:${candidate.targetId}:${candidate.targetFingerprint}`), conflictReason, selected: false, status: action === "conflict" ? "conflict" : action === "unchanged" ? "skipped" : "previewed" });
  }
  const sourceFingerprint = fingerprint(items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, targetFingerprint: item.targetFingerprint, action: item.action })));
  return withTransaction(async () => {
    const run = await db.jiraExportRun.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId, sourceFingerprint, itemCount: items.length, createCount: items.filter((item) => item.action === "create").length, updateCount: items.filter((item) => item.action === "update").length, conflictCount: items.filter((item) => item.action === "conflict").length, unchangedCount: items.filter((item) => item.action === "unchanged").length, initiatedByUserId: actorUserId } });
    if (items.length) await db.jiraExportItem.createMany({ data: items.map((item) => ({ ...item, connectionId: connection.id, exportRunId: run.id, idempotencyKey: jiraHash(`${run.id}:${item.targetType}:${item.targetId}`) })) });
    const conflictItems = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, action: "conflict", externalIssueId: { not: null } } });
    for (const item of conflictItems) {
      const evidence = conflictEvidence.get(item.targetId);
      if (!evidence) continue;
      await recordJiraConflict({ link: evidence.link, jiraSnapshot: evidence.snapshot, jiraFingerprint: evidence.jiraFingerprint, planningFingerprint: item.targetFingerprint, exportItemId: item.id, explanation: item.conflictReason ?? "Jira and Clarivia changed since the last synchronization." });
    }
    await auditInitiative(connection.initiativeId!, "jira.export_previewed", { jiraExportRunId: run.id, jiraConnectionId: connection.id, itemCount: items.length, createCount: run.createCount, updateCount: run.updateCount, conflictCount: run.conflictCount });
    return loadJiraExport(run.id);
  });
}

export async function approveJiraExport(runId: string, selectedItemIds: string[], reason: string, actorUserId: string) {
  if (process.env.JIRA_WRITE_ENABLED !== "true") throw new BusinessError("Jira exports are disabled while this connection is read-only.", 403);
  return withTransaction(async () => {
    const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
    if (!run) throw new BusinessError("Jira export preview not found.", 404);
    if (run.status !== "previewed") throw new BusinessError("This Jira export preview has already been finalized.", 409);
    const uniqueIds = [...new Set(selectedItemIds)];
    if (!uniqueIds.length) throw new BusinessError("Select at least one create or update.", 422);
    const selected = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, id: { in: uniqueIds } } });
    if (selected.length !== uniqueIds.length || selected.some((item) => !["create", "update"].includes(item.action))) throw new BusinessError("Only conflict-free create or update items can be approved.", 422);
    for (const item of selected) {
      if (!item.reviewSnapshot || dataObject(item.reviewSnapshot).schemaVersion !== 1) throw new BusinessError("Refresh this legacy export preview before approval.", 409);
      const link = { targetType: item.targetType, targetId: item.targetId } as JiraExternalLink;
      if (await currentTargetFingerprint(link) !== item.targetFingerprint) throw new BusinessError(`“${item.summary}” changed after the preview. Create a new preview.`, 409);
    }
    const snapshotHash = approvalHash(selected);
    const changed = await db.jiraExportRun.updateMany({ where: { id: run.id, status: "previewed" }, data: { status: "approved" } });
    if (changed.count !== 1) throw new BusinessError("This Jira export changed. Reload and try again.", 409);
    await db.jiraExportItem.updateMany({ where: { exportRunId: run.id, id: { in: uniqueIds } }, data: { status: "pending", selected: true } });
    await db.jiraExportItem.updateMany({ where: { exportRunId: run.id, id: { notIn: uniqueIds }, status: "previewed" }, data: { status: "skipped", selected: false } });
    await db.jiraExportApproval.create({ data: { organizationId: run.organizationId, exportRunId: run.id, selectedItemIds: uniqueIds, reason, snapshotHash, approvedByUserId: actorUserId } });
    await auditInitiative(run.initiativeId, "jira.export_approved", { jiraExportRunId: run.id, selectedItemIds: uniqueIds, reason, snapshotHash });
    return loadJiraExport(run.id);
  });
}

async function executeItem(item: Awaited<ReturnType<typeof db.jiraExportItem.findUniqueOrThrow>>, run: { connectionId: string; initiativeId: string; organizationId: string }, connection: { cloudId: string; projectId: string; projectKey: string | null; fieldMappings: unknown }, accessToken: string) {
  assertFrozenJiraTarget(item.reviewSnapshot, connection);
  const current = await currentTargetFingerprint({ targetType: item.targetType, targetId: item.targetId } as JiraExternalLink);
  if (current !== item.targetFingerprint) throw new BusinessError("The planning record changed after approval. Create and approve a new export.", 409);
  if (item.externalIssueId && item.expectedSourceHash) {
    const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: item.externalIssueId });
    assertJiraIssueProject(remote, connection);
    if (exportSourceFingerprint(remote) !== item.expectedSourceHash) throw new BusinessError("The Jira issue's exported fields changed after approval. Resolve the conflict before exporting.", 409);
  }
  const payload = item.requestPayload as unknown as ExportPayload;
  let identity = item.externalIssueId && item.externalKey ? { id: item.externalIssueId, key: item.externalKey } : null;
  if (item.action === "create" && !identity) {
    if (item.createAttemptedAt) throw new BusinessError("The previous Jira create may have succeeded. Verify and reconcile its issue before retrying.", 409);
    const marked = await db.jiraExportItem.updateMany({ where: { id: item.id, createAttemptedAt: null }, data: { createAttemptedAt: new Date() } });
    if (marked.count !== 1) throw new BusinessError("The Jira create attempt is already in progress or its result is uncertain.", 409);
    identity = await createJiraIssue({ cloudId: connection.cloudId, accessToken, fields: payload.fields });
    await db.jiraExportItem.update({ where: { id: item.id }, data: { externalIssueId: identity.id, externalKey: identity.key } });
  }
  else if (item.action === "update" && item.externalIssueId) await updateJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: item.externalIssueId, fields: { summary: payload.fields.summary, description: payload.fields.description } });
  if (!identity) throw new BusinessError("The Jira export item has no Jira identity.", 409);
  const saved = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: identity.id });
  const snapshot = sourceSnapshot(saved);
  const sourceHash = importSourceFingerprint(saved, item.targetType);
  await db.jiraExternalLink.upsert({ where: { connectionId_targetType_targetId: { connectionId: run.connectionId, targetType: item.targetType, targetId: item.targetId } }, create: { organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, externalIssueId: saved.id, externalKey: saved.key, issueTypeName: saved.issueType.name, targetType: item.targetType, targetId: item.targetId, sourceHash, exportSourceHash: exportSourceFingerprint(saved), targetFingerprint: item.targetFingerprint, sourceUpdatedAt: saved.updated ? new Date(saved.updated) : null, lastImportedSnapshot: {} }, update: { externalIssueId: saved.id, externalKey: saved.key, issueTypeName: saved.issueType.name, sourceHash, exportSourceHash: exportSourceFingerprint(saved), targetFingerprint: item.targetFingerprint, sourceUpdatedAt: saved.updated ? new Date(saved.updated) : null, lastImportedSnapshot: {}, lastImportedAt: new Date() } });
  await applyJiraDeliverySnapshot(run.connectionId, saved, connection.projectId, connection.projectKey, connection.fieldMappings);
  await db.jiraExportItem.update({ where: { id: item.id }, data: { status: "succeeded", externalIssueId: saved.id, externalKey: saved.key, resultSnapshot: snapshot as unknown as Prisma.InputJsonValue, failureMessage: null } });
}

export async function executeJiraExportItem(itemId: string) {
  if (process.env.JIRA_WRITE_ENABLED !== "true") throw new BusinessError("Jira exports are disabled while this connection is read-only.", 403);
  const item = await db.jiraExportItem.findUnique({ where: { id: itemId } });
  if (!item) throw new BusinessError("Jira export item not found.", 404);
  if (item.status === "succeeded") return item;
  if (item.status !== "pending" && item.status !== "failed") throw new BusinessError("This Jira export item is not eligible for execution.", 409);
  const run = await db.jiraExportRun.findUniqueOrThrow({ where: { id: item.exportRunId } });
  if (run.status !== "executing") throw new BusinessError("This Jira export is not executing.", 409);
  const { connection, accessToken } = await accessTokenFor(run.connectionId);
  if (!connection.cloudId || !connection.projectId) throw new BusinessError("The Jira connection is incomplete.", 422);
  await executeItem(item, run, { cloudId: connection.cloudId, projectId: connection.projectId, projectKey: connection.projectKey, fieldMappings: connection.fieldMappings }, accessToken);
  return db.jiraExportItem.findUniqueOrThrow({ where: { id: item.id } });
}

export async function reconcileUncertainJiraCreate(itemId: string, jiraKey: string, reason: string, actorUserId: string) {
  const item = await db.jiraExportItem.findUnique({ where: { id: itemId } });
  if (!item || item.action !== "create" || !item.createAttemptedAt || item.externalIssueId) throw new BusinessError("This export item has no unresolved Jira create attempt.", 409);
  const run = await db.jiraExportRun.findUniqueOrThrow({ where: { id: item.exportRunId } });
  const { connection, accessToken } = await accessTokenFor(run.connectionId);
  if (!connection.cloudId || !connection.projectId) throw new BusinessError("The Jira connection is incomplete.", 422);
  const issue = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: jiraKey });
  if (issue.key.toUpperCase() !== jiraKey.trim().toUpperCase() || issue.projectId !== connection.projectId) throw new BusinessError("The Jira key does not identify an issue in the configured project.", 409);
  const proposed = dataObject(dataObject(item.requestPayload).fields);
  const expectedType = stringValue(dataObject(proposed.issuetype).name);
  if (issue.issueType.name !== expectedType || issue.summary !== item.summary) throw new BusinessError("The Jira issue type or summary differs from the approved create. Review the issue before linking.", 409);
  const snapshot = sourceSnapshot(issue);
  await withTransaction(async () => {
    const current = await db.jiraExportItem.findUniqueOrThrow({ where: { id: item.id } });
    if (current.externalIssueId || !current.createAttemptedAt) throw new BusinessError("This Jira create was already reconciled.", 409);
    const alreadyLinked = await db.jiraExternalLink.findFirst({ where: { connectionId: run.connectionId, OR: [{ externalIssueId: issue.id }, { targetType: item.targetType, targetId: item.targetId }] } });
    if (alreadyLinked) throw new BusinessError("The Jira issue or planning item is already linked. Review the existing mapping.", 409);
    await db.jiraExternalLink.create({ data: { organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, externalIssueId: issue.id, externalKey: issue.key, issueTypeName: issue.issueType.name, targetType: item.targetType, targetId: item.targetId, sourceHash: importSourceFingerprint(issue, item.targetType), exportSourceHash: exportSourceFingerprint(issue), targetFingerprint: item.targetFingerprint, sourceUpdatedAt: issue.updated ? new Date(issue.updated) : null, lastImportedSnapshot: {} } });
    await db.jiraExportItem.update({ where: { id: item.id }, data: { externalIssueId: issue.id, externalKey: issue.key, status: "succeeded", resultSnapshot: snapshot as unknown as Prisma.InputJsonValue, failureMessage: null } });
    await auditInitiative(run.initiativeId, "jira.create_reconciled", { jiraExportRunId: run.id, jiraExportItemId: item.id, jiraIssueKey: issue.key, actorUserId, reason });
  });
  await applyJiraDeliverySnapshot(run.connectionId, issue, connection.projectId, connection.projectKey, connection.fieldMappings);
  return loadJiraExport(run.id);
}

export async function finalizeJiraExportRun(runId: string) {
  const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "executing") return run;
  const items = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, selected: true } });
  const jobs = await db.jiraSyncJob.findMany({ where: { jobType: "export_item", payload: { path: ["exportRunId"], equals: run.id } } });
  if (jobs.some((job) => job.status === "queued" || job.status === "processing")) return run;
  const failures = items.filter((item) => item.status !== "succeeded").length;
  const status = failures ? "partial_failure" : "completed";
  const saved = await db.jiraExportRun.update({ where: { id: run.id }, data: { status, executedAt: new Date(), failureMessage: failures ? `${failures} approved Jira export item(s) require attention.` : null } });
  await auditInitiative(run.initiativeId, "jira.export_executed", { jiraExportRunId: run.id, approvedCount: items.length, succeededCount: items.length - failures, failedCount: failures });
  return saved;
}

export async function executeJiraExport(runId: string, actorUserId: string) {
  if (process.env.JIRA_WRITE_ENABLED !== "true") throw new BusinessError("Jira exports are disabled while this connection is read-only.", 403);
  const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
  if (!run) throw new BusinessError("Jira export not found.", 404);
  if (run.status !== "approved") throw new BusinessError("Approve this Jira export before executing it.", 409);
  const approval = await db.jiraExportApproval.findUnique({ where: { exportRunId: run.id } });
  if (!approval || !Array.isArray(approval.selectedItemIds)) throw new BusinessError("The immutable Jira export approval is missing.", 409);
  const selectedIds = approval.selectedItemIds.map(String);
  const items = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, id: { in: selectedIds } } });
  if (items.length !== selectedIds.length || approvalHash(items) !== approval.snapshotHash) throw new BusinessError("The approved Jira export snapshot is invalid.", 409);
  return withTransaction(async () => {
    const changed = await db.jiraExportRun.updateMany({ where: { id: run.id, status: "approved" }, data: { status: "executing", executedByUserId: actorUserId } });
    if (changed.count !== 1) throw new BusinessError("This Jira export is already executing.", 409);
    await db.jiraSyncJob.createMany({ data: items.map((item) => ({ organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, jobType: "export_item", payload: { exportRunId: run.id, exportItemId: item.id }, idempotencyKey: jiraHash(`export:${item.id}`) })), skipDuplicates: true });
    await auditInitiative(run.initiativeId, "jira.export_queued", { jiraExportRunId: run.id, approvedCount: items.length });
    return loadJiraExport(run.id);
  });
}
