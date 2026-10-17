import type { JiraExternalLink, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { createJiraIssue, getJiraIssue, updateJiraIssue } from "./client";
import { jiraHash } from "./crypto";
import { currentTargetFingerprint, fingerprint, sourceSnapshot } from "./import";
import { accessTokenFor } from "./oauth";

type TargetType = "feature" | "story" | "bug";
type ExportPayload = { fields: Record<string, unknown> };
type Candidate = { targetType: TargetType; targetId: string; summary: string; description: string; issueType: string; targetFingerprint: string };
type PreviewExportItem = { organizationId: string; targetType: TargetType; targetId: string; summary: string; externalIssueId: string | null; externalKey: string | null; action: "create" | "update" | "unchanged" | "conflict"; requestPayload: Prisma.InputJsonValue; targetFingerprint: string; expectedSourceHash: string | null; idempotencyKey: string; conflictReason: string | null; selected: boolean; status: string };

const adf = (value: string) => ({ type: "doc", version: 1, content: value.split(/\n+/).filter(Boolean).map((text) => ({ type: "paragraph", content: [{ type: "text", text: text.slice(0, 32000) }] })) });
const dataObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown) => typeof value === "string" ? value : "";

function fieldsFor(candidate: Candidate, projectId: string): ExportPayload {
  return { fields: { project: { id: projectId }, summary: candidate.summary, description: adf(candidate.description || candidate.summary), issuetype: { name: candidate.issueType } } };
}

async function candidates(initiativeId: string): Promise<Candidate[]> {
  const [features, stories, bugs] = await Promise.all([
    db.capability.findMany({ where: { intakeAnswerSet: { initiativeId }, backlogStatus: { not: "archived" } }, select: { id: true, name: true, description: true, backlogLane: true, backlogStatus: true, businessValue: true, riskLevel: true, backlogRevision: true }, orderBy: { order: "asc" } }),
    db.artifactLayer.findMany({ where: { prototype: { initiativeId }, type: "story", archivedAt: null }, include: { children: { where: { type: "acceptance_criterion", archivedAt: null }, orderBy: { order: "asc" }, select: { title: true, body: true } } }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    db.bugPlanningRecord.findMany({ where: { initiativeId, archivedAt: null }, include: { request: { select: { data: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return [
    ...features.map((row) => ({ targetType: "feature" as const, targetId: row.id, summary: row.name, description: row.description, issueType: "Epic", targetFingerprint: fingerprint(row) })),
    ...stories.map((row) => ({ targetType: "story" as const, targetId: row.id, summary: row.title, description: `${row.body}${row.children.length ? `\n\nAcceptance criteria\n${row.children.map((item, index) => `${index + 1}. ${item.title}${item.body ? ` — ${item.body}` : ""}`).join("\n")}` : ""}`, issueType: "Story", targetFingerprint: fingerprint({ title: row.title, body: row.body, points: row.points, readinessStatus: row.readinessStatus, backlogRevision: row.backlogRevision, archivedAt: row.archivedAt?.toISOString() ?? null }) })),
    ...bugs.map((row) => { const request = dataObject(row.request.data); const bug = dataObject(request.bug); return { targetType: "bug" as const, targetId: row.id, summary: stringValue(request.title) || "Planning bug", description: [stringValue(request.problem), `Observed: ${stringValue(bug.observedBehavior)}`, `Expected: ${stringValue(bug.expectedBehavior)}`, `Reproduction: ${stringValue(bug.reproductionDetails)}`, `Environment: ${row.environment}`].filter(Boolean).join("\n"), issueType: "Bug", targetFingerprint: fingerprint({ severity: row.severity, status: row.status, priority: row.priority, environment: row.environment, revision: row.revision, request: row.request.data }) }; }),
  ];
}

function approvalHash(items: { id: string; targetFingerprint: string; requestPayload: Prisma.JsonValue }[]) {
  return fingerprint([...items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({ id: item.id, targetFingerprint: item.targetFingerprint, requestPayload: item.requestPayload })));
}

export async function loadJiraExport(runId: string) {
  const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  const [items, approval] = await Promise.all([
    db.jiraExportItem.findMany({ where: { exportRunId: run.id }, orderBy: [{ action: "asc" }, { summary: "asc" }] }),
    db.jiraExportApproval.findUnique({ where: { exportRunId: run.id } }),
  ]);
  return { ...run, items, approval };
}

export async function previewJiraExport(connectionId: string, actorUserId: string) {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (connection.status !== "connected" || !connection.initiativeId || !connection.cloudId || !connection.projectId) throw new BusinessError("Finish selecting a Jira site, project, and initiative before exporting.", 422);
  if (!connection.scopes.split(/\s+/).includes("write:jira-work")) throw new BusinessError("Reconnect Jira and grant write access before creating an export preview.", 422);
  const local = await candidates(connection.initiativeId);
  const links = await db.jiraExternalLink.findMany({ where: { connectionId } });
  const byTarget = new Map(links.map((link) => [`${link.targetType}:${link.targetId}`, link]));
  const items: PreviewExportItem[] = [];
  for (const candidate of local) {
    const link = byTarget.get(`${candidate.targetType}:${candidate.targetId}`);
    let action: "create" | "update" | "unchanged" | "conflict" = link ? "update" : "create";
    let conflictReason: string | null = null;
    let expectedSourceHash: string | null = link?.sourceHash ?? null;
    if (link && candidate.targetFingerprint === link.targetFingerprint) action = "unchanged";
    else if (link) {
      try {
        const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: link.externalIssueId });
        const currentSourceHash = fingerprint(sourceSnapshot(remote));
        if (currentSourceHash !== link.sourceHash) { action = "conflict"; conflictReason = "Both Jira and the planning record changed since the last synchronization."; }
        expectedSourceHash = currentSourceHash;
      } catch (error) { action = "conflict"; conflictReason = error instanceof Error ? `Could not verify Jira: ${error.message}` : "Could not verify the linked Jira issue."; }
    }
    const payload = fieldsFor(candidate, connection.projectId);
    items.push({ organizationId: connection.organizationId, targetType: candidate.targetType, targetId: candidate.targetId, summary: candidate.summary, externalIssueId: link?.externalIssueId ?? null, externalKey: link?.externalKey ?? null, action, requestPayload: payload as unknown as Prisma.InputJsonValue, targetFingerprint: candidate.targetFingerprint, expectedSourceHash, idempotencyKey: jiraHash(`${connection.id}:${candidate.targetType}:${candidate.targetId}:${candidate.targetFingerprint}`), conflictReason, selected: action === "create" || action === "update", status: action === "conflict" ? "conflict" : action === "unchanged" ? "skipped" : "previewed" });
  }
  const sourceFingerprint = fingerprint(items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, targetFingerprint: item.targetFingerprint, action: item.action })));
  return withTransaction(async () => {
    const run = await db.jiraExportRun.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId, sourceFingerprint, itemCount: items.length, createCount: items.filter((item) => item.action === "create").length, updateCount: items.filter((item) => item.action === "update").length, conflictCount: items.filter((item) => item.action === "conflict").length, unchangedCount: items.filter((item) => item.action === "unchanged").length, initiatedByUserId: actorUserId } });
    if (items.length) await db.jiraExportItem.createMany({ data: items.map((item) => ({ ...item, exportRunId: run.id })) });
    await auditInitiative(connection.initiativeId!, "jira.export_previewed", { jiraExportRunId: run.id, jiraConnectionId: connection.id, itemCount: items.length, createCount: run.createCount, updateCount: run.updateCount, conflictCount: run.conflictCount });
    return loadJiraExport(run.id);
  });
}

export async function approveJiraExport(runId: string, selectedItemIds: string[], reason: string, actorUserId: string) {
  return withTransaction(async () => {
    const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
    if (!run) throw new BusinessError("Jira export preview not found.", 404);
    if (run.status !== "previewed") throw new BusinessError("This Jira export preview has already been finalized.", 409);
    const uniqueIds = [...new Set(selectedItemIds)];
    if (!uniqueIds.length) throw new BusinessError("Select at least one create or update.", 422);
    const selected = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, id: { in: uniqueIds } } });
    if (selected.length !== uniqueIds.length || selected.some((item) => !["create", "update"].includes(item.action))) throw new BusinessError("Only conflict-free create or update items can be approved.", 422);
    for (const item of selected) {
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

async function executeItem(item: Awaited<ReturnType<typeof db.jiraExportItem.findUniqueOrThrow>>, run: { connectionId: string; initiativeId: string; organizationId: string }, connection: { cloudId: string; projectId: string }, accessToken: string) {
  const current = await currentTargetFingerprint({ targetType: item.targetType, targetId: item.targetId } as JiraExternalLink);
  if (current !== item.targetFingerprint) throw new BusinessError("The planning record changed after approval. Create and approve a new export.", 409);
  if (item.externalIssueId && item.expectedSourceHash) {
    const remote = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: item.externalIssueId });
    if (fingerprint(sourceSnapshot(remote)) !== item.expectedSourceHash) throw new BusinessError("The Jira issue changed after approval. Resolve the conflict before exporting.", 409);
  }
  const payload = item.requestPayload as unknown as ExportPayload;
  let identity = item.externalIssueId && item.externalKey ? { id: item.externalIssueId, key: item.externalKey } : null;
  if (item.action === "create") identity = await createJiraIssue({ cloudId: connection.cloudId, accessToken, fields: payload.fields });
  else if (item.action === "update" && item.externalIssueId) await updateJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: item.externalIssueId, fields: { summary: payload.fields.summary, description: payload.fields.description } });
  if (!identity) throw new BusinessError("The Jira export item has no Jira identity.", 409);
  const saved = await getJiraIssue({ cloudId: connection.cloudId, accessToken, issueIdOrKey: identity.id });
  const snapshot = sourceSnapshot(saved);
  const sourceHash = fingerprint(snapshot);
  await db.jiraExternalLink.upsert({ where: { connectionId_targetType_targetId: { connectionId: run.connectionId, targetType: item.targetType, targetId: item.targetId } }, create: { organizationId: run.organizationId, initiativeId: run.initiativeId, connectionId: run.connectionId, externalIssueId: saved.id, externalKey: saved.key, issueTypeName: saved.issueType.name, targetType: item.targetType, targetId: item.targetId, sourceHash, targetFingerprint: item.targetFingerprint, sourceUpdatedAt: saved.updated ? new Date(saved.updated) : null, lastImportedSnapshot: snapshot as unknown as Prisma.InputJsonValue }, update: { externalIssueId: saved.id, externalKey: saved.key, issueTypeName: saved.issueType.name, sourceHash, targetFingerprint: item.targetFingerprint, sourceUpdatedAt: saved.updated ? new Date(saved.updated) : null, lastImportedSnapshot: snapshot as unknown as Prisma.InputJsonValue, lastImportedAt: new Date() } });
  await db.jiraExportItem.update({ where: { id: item.id }, data: { status: "succeeded", externalIssueId: saved.id, externalKey: saved.key, resultSnapshot: snapshot as unknown as Prisma.InputJsonValue, failureMessage: null } });
}

export async function executeJiraExport(runId: string, actorUserId: string) {
  const run = await db.jiraExportRun.findUnique({ where: { id: runId } });
  if (!run) throw new BusinessError("Jira export not found.", 404);
  if (run.status !== "approved") throw new BusinessError("Approve this Jira export before executing it.", 409);
  const approval = await db.jiraExportApproval.findUnique({ where: { exportRunId: run.id } });
  if (!approval || !Array.isArray(approval.selectedItemIds)) throw new BusinessError("The immutable Jira export approval is missing.", 409);
  const selectedIds = approval.selectedItemIds.map(String);
  const items = await db.jiraExportItem.findMany({ where: { exportRunId: run.id, id: { in: selectedIds } } });
  if (items.length !== selectedIds.length || approvalHash(items) !== approval.snapshotHash) throw new BusinessError("The approved Jira export snapshot is invalid.", 409);
  const changed = await db.jiraExportRun.updateMany({ where: { id: run.id, status: "approved" }, data: { status: "executing", executedByUserId: actorUserId } });
  if (changed.count !== 1) throw new BusinessError("This Jira export is already executing.", 409);
  const { connection, accessToken } = await accessTokenFor(run.connectionId);
  if (!connection.cloudId || !connection.projectId) throw new BusinessError("The Jira connection is incomplete.", 422);
  let failures = 0;
  for (const item of items) {
    try { await executeItem(item, run, { cloudId: connection.cloudId, projectId: connection.projectId }, accessToken); }
    catch (error) { failures += 1; await db.jiraExportItem.update({ where: { id: item.id }, data: { status: error instanceof BusinessError && error.status === 409 ? "conflict" : "failed", failureMessage: error instanceof Error ? error.message.slice(0, 2000) : "Jira export failed." } }); }
  }
  const status = failures ? "partial_failure" : "completed";
  await db.jiraExportRun.update({ where: { id: run.id }, data: { status, executedAt: new Date(), failureMessage: failures ? `${failures} approved Jira export item(s) require attention.` : null } });
  await auditInitiative(run.initiativeId, "jira.export_executed", { jiraExportRunId: run.id, approvedCount: items.length, succeededCount: items.length - failures, failedCount: failures });
  return loadJiraExport(run.id);
}
