import type { BugPlanningRecord, Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";
import { withPlanningMutation } from "@/lib/generation/mutation";
import type { RequestInput } from "@/lib/requests/model";
import type { BugPlanningUpdate } from "./model";

const statusFromRequest = (status: RequestInput["bug"]["status"]): BugPlanningRecord["status"] => {
  if (status === "in_progress" || status === "resolved" || status === "closed") return status;
  return "open";
};

const priorityFromRequest = (data: RequestInput): BugPlanningRecord["priority"] =>
  data.priority.bugSeverity === "not_applicable" ? data.bug.severity : data.priority.bugSeverity;

function snapshot(row: BugPlanningRecord) {
  return {
    bugType: row.bugType,
    source: row.source,
    sourceReference: row.sourceReference,
    externalSystem: row.externalSystem,
    externalKey: row.externalKey,
    severity: row.severity,
    status: row.status,
    priority: row.priority,
    environment: row.environment,
    readinessStatus: row.readinessStatus,
    affectedCapabilityId: row.affectedCapabilityId,
    affectedStoryId: row.affectedStoryId,
    affectedSprintId: row.affectedSprintId,
    affectedReleaseId: row.affectedReleaseId,
    ownerUserId: row.ownerUserId,
    revision: row.revision,
  };
}

/** Called inside saveRequest's serializable transaction. The intake remains
 * authoritative; this durable projection only supplies planning links. */
export async function syncBugPlanningFromRequest(input: {
  organizationId: string;
  initiativeId: string;
  requestId: string;
  data: RequestInput;
  actorUserId?: string;
  reason: string;
}) {
  const existing = await db.bugPlanningRecord.findUnique({ where: { requestId: input.requestId } });
  const isBug = input.data.kind === "bug" || input.data.kind === "defect";
  if (!isBug) {
    if (existing && !existing.archivedAt) {
      const next = { ...snapshot(existing), archivedAt: new Date().toISOString(), revision: existing.revision + 1 };
      await db.bugPlanningRevision.create({ data: {
        organizationId: input.organizationId, bugId: existing.id,
        fromRevision: existing.revision, toRevision: existing.revision + 1,
        previousData: snapshot(existing), nextData: next, reason: input.reason,
        actorUserId: input.actorUserId,
      } });
      await db.bugPlanningRecord.update({ where: { id: existing.id }, data: { archivedAt: new Date(), revision: { increment: 1 } } });
    }
    return null;
  }

  const sourceIdentity = input.data.source === "jira" && input.data.sourceReference
    ? { externalSystem: "jira", externalKey: input.data.sourceReference }
    : { externalSystem: null, externalKey: null };
  const values = {
    bugType: input.data.kind,
    source: input.data.source,
    sourceReference: input.data.sourceReference || null,
    ...sourceIdentity,
    severity: input.data.bug.severity,
    status: statusFromRequest(input.data.bug.status),
    priority: priorityFromRequest(input.data),
    environment: input.data.bug.environment,
    archivedAt: null,
  };
  if (!existing) {
    return db.bugPlanningRecord.create({ data: {
      organizationId: input.organizationId,
      initiativeId: input.initiativeId,
      requestId: input.requestId,
      ...values,
    } });
  }
  const next = { ...snapshot(existing), ...values, revision: existing.revision + 1 };
  await db.bugPlanningRevision.create({ data: {
    organizationId: input.organizationId, bugId: existing.id,
    fromRevision: existing.revision, toRevision: existing.revision + 1,
    previousData: snapshot(existing), nextData: next as Prisma.InputJsonObject,
    reason: input.reason, actorUserId: input.actorUserId,
  } });
  return db.bugPlanningRecord.update({ where: { id: existing.id }, data: { ...values, revision: { increment: 1 } } });
}

async function validateLinks(initiativeId: string, input: BugPlanningUpdate, organizationId: string) {
  if (input.ownerUserId) {
    const member = await db.organizationMember.findFirst({
      where: { organizationId, status: "active", user: { id: input.ownerUserId } }, select: { id: true },
    });
    if (!member) throw new BusinessError("The selected bug owner is not an active organization member.", 422);
  }
  if (input.affectedCapabilityId) {
    const feature = await db.capability.findFirst({ where: { id: input.affectedCapabilityId, intakeAnswerSet: { initiativeId } }, select: { id: true } });
    if (!feature) throw new BusinessError("The selected feature does not belong to this initiative.", 422);
  }
  if (input.affectedStoryId) {
    const story = await db.artifactLayer.findFirst({ where: { id: input.affectedStoryId, type: "story", prototype: { initiativeId } }, select: { id: true } });
    if (!story) throw new BusinessError("The selected story does not belong to this initiative.", 422);
  }
  if (input.affectedSprintId) {
    const sprint = await db.sprint.findFirst({ where: { id: input.affectedSprintId, prototype: { initiativeId } }, select: { id: true } });
    if (!sprint) throw new BusinessError("The selected sprint does not belong to this initiative.", 422);
  }
  if (input.affectedReleaseId) {
    const release = await db.release.findFirst({ where: { id: input.affectedReleaseId, prototype: { initiativeId } }, select: { id: true } });
    if (!release) throw new BusinessError("The selected release does not belong to this initiative.", 422);
  }
}

export async function updateBugPlanningRecord(bugId: string, input: BugPlanningUpdate, actorUserId: string) {
  const initial = await db.bugPlanningRecord.findUnique({ where: { id: bugId } });
  if (!initial) throw new BusinessError("Bug planning record not found.", 404);
  return withPlanningMutation(initial.initiativeId, "bug_planning.updated", async () => {
    const current = await db.bugPlanningRecord.findUniqueOrThrow({ where: { id: bugId } });
    if (current.revision !== input.expectedRevision) throw new BusinessError("This bug changed. Reload before saving.", 409);
    await validateLinks(current.initiativeId, input, current.organizationId);
    const changes = {
      ...(input.bugType !== undefined ? { bugType: input.bugType } : {}),
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
      ...(input.readinessStatus !== undefined ? { readinessStatus: input.readinessStatus } : {}),
      ...(input.affectedCapabilityId !== undefined ? { affectedCapabilityId: input.affectedCapabilityId } : {}),
      ...(input.affectedStoryId !== undefined ? { affectedStoryId: input.affectedStoryId } : {}),
      ...(input.affectedSprintId !== undefined ? { affectedSprintId: input.affectedSprintId } : {}),
      ...(input.affectedReleaseId !== undefined ? { affectedReleaseId: input.affectedReleaseId } : {}),
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
    };
    const next = { ...snapshot(current), ...changes, revision: current.revision + 1 };
    await db.bugPlanningRevision.create({ data: {
      organizationId: current.organizationId, bugId,
      fromRevision: current.revision, toRevision: current.revision + 1,
      previousData: snapshot(current), nextData: next as Prisma.InputJsonObject,
      reason: input.reason, actorUserId,
    } });
    const changed = await db.bugPlanningRecord.updateMany({
      where: { id: bugId, revision: input.expectedRevision }, data: { ...changes, revision: { increment: 1 } },
    });
    if (changed.count !== 1) throw new BusinessError("This bug changed. Reload before saving.", 409);
    const saved = await db.bugPlanningRecord.findUniqueOrThrow({ where: { id: bugId } });
    await auditInitiative(current.initiativeId, "bug_planning.updated", {
      bugId, requestId: current.requestId, reason: input.reason,
      fromRevision: current.revision, toRevision: saved.revision,
    });
    return saved;
  }, true);
}
