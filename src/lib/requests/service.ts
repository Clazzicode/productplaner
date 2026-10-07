import type { PlanningRequest, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { db, withTransaction } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { requestSchema, type RequestInput, type RequestRecord } from "./model";

export function requestRecord(row: PlanningRequest): RequestRecord {
  return { ...requestSchema.parse(row.data), id: row.id, revision: row.revision,
    capabilityId: row.capabilityId, sourceRecordId: row.sourceRecordId, updatedAt: row.updatedAt.toISOString() };
}

export function requestDedupeKey(data: Pick<RequestInput, "kind" | "title" | "problem" | "requestedChange">): string {
  const normalized = [data.kind, data.title, data.problem, data.requestedChange]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function sourceFingerprint(value: string): string {
  return createHash("sha256").update(value.trim().replace(/\r\n/g, "\n")).digest("hex");
}

export async function saveRequest(initiativeId: string, input: RequestInput, existing?: { id: string; revision: number }, options?: {
  actorUserId?: string;
  linkedCapabilityId?: string;
  source?: { type: "spreadsheet_row" | "document_finding"; label: string; rawContent: string; locator?: string; documentId?: string; contextItemId?: string };
}) {
  const data = requestSchema.parse(input);
  return withTransaction(async () => {
    const previous = existing ? await db.planningRequest.findFirst({ where: { id: existing.id, initiativeId } }) : null;
    if (existing && !previous) throw new BusinessError("Request not found.", 404);
    if (previous && previous.revision !== existing!.revision) throw new BusinessError("This request changed. Reload before saving your edits.");
    if (previous) {
      const old = requestSchema.parse(previous.data);
      if (previous.sourceRecordId && (old.source !== data.source || old.sourceReference !== data.sourceReference || old.meetingNotes !== data.meetingNotes)) {
        throw new BusinessError("The original source is immutable. Create a new request to use different source evidence.");
      }
      // An approved request cannot silently retain approval after its meaning changes.
      const oldFields = { ...old, status: null };
      const newFields = { ...data, status: null };
      if (old.status === "approved" && data.status === "approved" && JSON.stringify(oldFields) !== JSON.stringify(newFields)) {
        throw new BusinessError("Reopen this request for clarification before changing an approved decision.");
      }
    }
    const dedupeKey = requestDedupeKey(data);
    const duplicate = await db.planningRequest.findFirst({ where: { initiativeId, dedupeKey, ...(previous ? { id: { not: previous.id } } : {}) } });
    if (duplicate) throw new BusinessError(`A matching request already exists: ${requestSchema.parse(duplicate.data).title}.`, 409);
    let sourceRecordId = previous?.sourceRecordId ?? null;
    if (!previous && (options?.source || data.source === "meeting")) {
      if (!options?.actorUserId) throw new BusinessError("The source author is required.");
      const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true, projectId: true } });
      if (!initiative) throw new BusinessError("Initiative not found.", 404);
      const source: { type: "spreadsheet_row" | "document_finding" | "meeting_note"; label: string; rawContent: string; locator?: string; documentId?: string; contextItemId?: string } =
        options?.source ?? { type: "meeting_note", label: data.sourceReference, rawContent: data.meetingNotes };
      const fingerprint = sourceFingerprint(`${source.type}|${source.documentId ?? ""}|${source.contextItemId ?? ""}|${source.locator ?? ""}|${source.rawContent}`);
      const sourceRecord = await db.requestSourceRecord.create({ data: {
        organizationId: initiative.organizationId, projectId: initiative.projectId, initiativeId,
        type: source.type, label: source.label, rawContent: source.rawContent, locator: source.locator,
        fingerprint, documentId: source.documentId, contextItemId: source.contextItemId, createdByUserId: options.actorUserId,
      } });
      sourceRecordId = sourceRecord.id;
    }
    const row = previous
      ? await db.planningRequest.update({ where: { id: previous.id, initiativeId, revision: existing!.revision },
          data: { data: data as Prisma.InputJsonObject, dedupeKey, revision: { increment: 1 } } })
      : await db.planningRequest.create({ data: { initiativeId, data: data as Prisma.InputJsonObject, dedupeKey, sourceRecordId, capabilityId: options?.linkedCapabilityId } });
    await auditInitiative(initiativeId, previous ? "request.updated" : "request.created", {
      requestId: row.id, revision: row.revision, status: data.status, decision: data.priority.decision,
      previousStatus: previous ? requestSchema.parse(previous.data).status : null,
      previousDecision: previous ? requestSchema.parse(previous.data).priority.decision : null,
      priority: data.priority,
      previousPriority: previous ? requestSchema.parse(previous.data).priority : null,
    });
    return requestRecord(row);
  });
}

export async function promoteRequest(initiativeId: string, requestId: string, revision: number) {
  return withPlanningMutation(initiativeId, "request.feature_created", async () => {
    const row = await db.planningRequest.findFirst({ where: { id: requestId, initiativeId } });
    if (!row) throw new BusinessError("Request not found.", 404);
    if (row.revision !== revision) throw new BusinessError("This request changed. Reload before creating a feature.");
    if (row.capabilityId) throw new BusinessError("This request already has a planning feature.");
    const data = requestSchema.parse(row.data);
    if (data.status !== "approved") throw new BusinessError("Approve this request before creating a feature.");
    const prototype = await db.prototype.findUnique({ where: { initiativeId }, select: { approvedAt: true } });
    if (prototype?.approvedAt) throw new BusinessError("Reopen the approved plan before adding a planning feature.");
    const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId } });
    if (!intake) throw new BusinessError("Complete the initiative's guided intake first.");
    const max = await db.capability.aggregate({ where: { intakeAnswerSetId: intake.id }, _max: { order: true } });
    const bugContext = data.kind === "bug" || data.kind === "defect"
      ? `\n\nBug severity: ${data.bug.severity}\nAffected area: ${data.bug.affectedArea}\nObserved: ${data.bug.observedBehavior}\nExpected: ${data.bug.expectedBehavior}\nEnvironment: ${data.bug.environment || "Not specified"}`
      : "";
    const capability = await db.capability.create({ data: {
      intakeAnswerSetId: intake.id, name: data.title,
      description: `${data.requestedChange}\n\nProblem: ${data.problem}\nExpected outcome: ${data.outcome}\nBusiness value: ${data.businessValueNarrative}\nBusiness rules: ${data.businessRules}\nDependencies to review: ${data.dependencies}\nSource: ${data.source}${data.sourceReference ? ` (${data.sourceReference})` : ""}${bugContext}`,
      isMvp: false, effortSize: ["xs", "s", "m", "l", "xl"][data.priority.effort - 1],
      businessValue: ["very_low", "low", "medium", "high", "critical"][data.priority.businessValue - 1],
      riskLevel: ["low", "low", "medium", "high", "critical"][data.priority.risk - 1],
      backlogLane: data.priority.decision === "untriaged" ? "unscheduled" : data.priority.decision,
      order: (max._max.order ?? -1) + 1,
    } });
    const updated = await db.planningRequest.update({ where: { id: row.id, initiativeId, revision }, data: { capabilityId: capability.id, revision: { increment: 1 } } });
    await auditInitiative(initiativeId, "request.linked_to_feature", { requestId: row.id, capabilityId: capability.id });
    return requestRecord(updated);
  }, true);
}
