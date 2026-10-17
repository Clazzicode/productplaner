import { createHash } from "node:crypto";
import { Prisma, type InSprintClarification } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { emptyRequest } from "@/lib/requests/model";
import { saveRequest } from "@/lib/requests/service";
import type { ClarificationCommandInput, ClarificationCreateInput } from "./model";

export const clarificationInclude = {
  sprint: { select: { sprintNumber: true, startDate: true, endDate: true } },
  story: { select: { id: true, title: true, body: true, backlogRevision: true } },
  bug: { include: { request: { select: { data: true } } } },
  owner: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true } },
  answeredBy: { select: { id: true, name: true } },
  acknowledgedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  revisions: { orderBy: { createdAt: "desc" as const }, take: 20, include: { actor: { select: { name: true } } } },
  aiSuggestions: { orderBy: { createdAt: "desc" as const }, take: 10 },
} satisfies Prisma.InSprintClarificationInclude;

export function clarificationSnapshot(row: InSprintClarification): Prisma.InputJsonObject {
  return {
    question: row.question, context: row.context, status: row.status, urgency: row.urgency,
    ownerUserId: row.ownerUserId, answer: row.answer, rationale: row.rationale, impact: row.impact,
    dueAt: row.dueAt?.toISOString() ?? null, externalReference: row.externalReference,
    followUpRequestId: row.followUpRequestId,
    answeredByUserId: row.answeredByUserId, answeredAt: row.answeredAt?.toISOString() ?? null,
    acknowledgedByUserId: row.acknowledgedByUserId, acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId, resolvedAt: row.resolvedAt?.toISOString() ?? null,
    revision: row.revision,
  };
}

async function requireActiveMember(organizationId: string, userId: string | null | undefined) {
  if (!userId) return;
  const member = await db.organizationMember.findFirst({
    where: { organizationId, status: "active", user: { id: userId } }, select: { id: true },
  });
  if (!member) throw new BusinessError("The selected clarification owner is not an active organization member.", 422);
}

async function scopedClarification(id: string) {
  const row = await db.inSprintClarification.findUnique({ where: { id } });
  if (!row) throw new BusinessError("Clarification not found.", 404);
  return row;
}

export async function createClarification(initiativeId: string, input: ClarificationCreateInput, actorUserId: string) {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    await requireActiveMember(initiative.organizationId, input.ownerUserId);
    const plan = await db.sprintPlan.findFirst({
      where: { initiativeId, sprintId: input.sprintId, status: "committed" },
      include: { items: { select: { storyId: true, bugId: true } } },
    });
    if (!plan) throw new BusinessError("Clarifications can only be opened for a committed sprint.", 422);
    const selected = plan.items.some((item) => input.storyId ? item.storyId === input.storyId : item.bugId === input.bugId);
    if (!selected) throw new BusinessError("The selected work is not committed to this sprint.", 422);
    const dedupeKey = createHash("sha256").update(input.question.trim().toLocaleLowerCase().replace(/\s+/g, " ")).digest("hex");
    const duplicate = await db.inSprintClarification.findFirst({
      where: { initiativeId, sprintId: input.sprintId, storyId: input.storyId ?? null, bugId: input.bugId ?? null,
        dedupeKey, status: { in: ["open", "answered", "acknowledged"] } }, select: { id: true },
    });
    if (duplicate) throw new BusinessError("This clarification question is already open for the sprint item.", 409);
    let row;
    try {
      row = await db.inSprintClarification.create({ data: {
        organizationId: initiative.organizationId, initiativeId, sprintId: input.sprintId,
        storyId: input.storyId ?? null, bugId: input.bugId ?? null, question: input.question, dedupeKey,
        context: input.context, urgency: input.urgency, ownerUserId: input.ownerUserId ?? null,
        requesterUserId: actorUserId, dueAt: input.dueAt ?? null, externalReference: input.externalReference || null,
      }, include: clarificationInclude });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("This clarification question is already open for the sprint item.", 409);
      throw error;
    }
    await auditInitiative(initiativeId, "clarification.created", { clarificationId: row.id, sprintId: row.sprintId, target: row.storyId ? `story:${row.storyId}` : `bug:${row.bugId}`, urgency: row.urgency });
    return row;
  });
}

function nextState(row: InSprintClarification, input: ClarificationCommandInput, actorUserId: string, canDecide: boolean) {
  const now = new Date();
  if (input.action === "answer") {
    if (["resolved", "withdrawn"].includes(row.status)) throw new BusinessError("Reopen this clarification before answering it.", 409);
    return { status: "answered", answer: input.answer, rationale: input.rationale, impact: input.impact,
      ownerUserId: actorUserId, answeredByUserId: actorUserId, answeredAt: now,
      acknowledgedByUserId: null, acknowledgedAt: null, resolvedByUserId: null, resolvedAt: null };
  }
  if (input.action === "acknowledge") {
    if (row.status !== "answered") throw new BusinessError("Only an answered clarification can be acknowledged.", 409);
    if (row.requesterUserId !== actorUserId) throw new BusinessError("Only the person who asked the question can acknowledge the answer.", 403);
    return { status: "acknowledged", acknowledgedByUserId: actorUserId, acknowledgedAt: now };
  }
  if (input.action === "resolve") {
    if (!row.answer.trim() || !["answered", "acknowledged"].includes(row.status)) throw new BusinessError("Answer the clarification before resolving it.", 409);
    return { status: "resolved", resolvedByUserId: actorUserId, resolvedAt: now };
  }
  if (input.action === "reopen") {
    if (!["resolved", "answered", "acknowledged", "withdrawn"].includes(row.status)) throw new BusinessError("This clarification is already open.", 409);
    return { status: "open", resolvedByUserId: null, resolvedAt: null, acknowledgedByUserId: null, acknowledgedAt: null };
  }
  if (input.action === "create_follow_up") throw new BusinessError("Follow-up creation must be handled transactionally.", 500);
  if (!canDecide && !(row.status === "open" && !row.answer.trim() && row.requesterUserId === actorUserId)) {
    throw new BusinessError("Only an organization owner or administrator can withdraw an answered clarification.", 403);
  }
  if (row.status === "resolved") throw new BusinessError("A resolved clarification cannot be withdrawn.", 409);
  return { status: "withdrawn" };
}

export async function applyClarificationCommand(id: string, input: ClarificationCommandInput, actorUserId: string, canDecide: boolean) {
  return withTransaction(async () => {
    const row = await scopedClarification(id);
    if (row.revision !== input.expectedRevision) throw new BusinessError("This clarification changed. Reload before saving.", 409);
    if (["answer", "resolve", "reopen", "create_follow_up"].includes(input.action) && !canDecide) throw new BusinessError("Only an organization owner or administrator can make the Product Owner clarification decision.", 403);
    let changes: Record<string, unknown>;
    let createdFollowUpRequestId: string | null = null;
    if (input.action === "create_follow_up") {
      if (!row.answer.trim() || !["answered", "acknowledged"].includes(row.status)) throw new BusinessError("Answer the clarification before creating follow-up work.", 409);
      if (row.followUpRequestId) throw new BusinessError("Follow-up work already exists for this clarification.", 409);
      const actor = await db.user.findUnique({ where: { id: actorUserId }, select: { name: true } });
      if (!actor) throw new BusinessError("Product Owner not found.", 404);
      const request = emptyRequest();
      request.title = input.title;
      request.requestor = actor.name;
      request.problem = row.question;
      request.requestedChange = row.answer;
      request.outcome = "Define and deliver the follow-up outcome recorded by the Product Owner.";
      request.dependencies = row.storyId ? `Source story: ${row.storyId}` : `Source bug: ${row.bugId}`;
      request.supportingMaterials = `Created from in-sprint clarification ${row.id}. ${row.rationale}`.trim();
      request.priority.reason = "Created from an answered in-sprint clarification; Product Owner triage is required.";
      const followUp = await saveRequest(row.initiativeId, request, undefined, { actorUserId, changeReason: input.reason });
      createdFollowUpRequestId = followUp.id;
      changes = { followUpRequestId: followUp.id, impact: "follow_up_work" };
    } else {
      changes = nextState(row, input, actorUserId, canDecide);
    }
    const previous = clarificationSnapshot(row);
    const next = { ...previous, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])), revision: row.revision + 1 } as Prisma.InputJsonObject;
    await db.inSprintClarificationRevision.create({ data: { organizationId: row.organizationId, clarificationId: row.id,
      fromRevision: row.revision, toRevision: row.revision + 1, previousData: previous, nextData: next,
      reason: input.reason, actorUserId } });
    const changed = await db.inSprintClarification.updateMany({ where: { id: row.id, revision: row.revision }, data: { ...changes, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new BusinessError("This clarification changed. Reload before saving.", 409);
    if (input.action === "answer" && !["none", "clarification_only"].includes(input.impact) && row.storyId) {
      const story = await db.artifactLayer.findUniqueOrThrow({ where: { id: row.storyId } });
      await db.artifactRevision.create({ data: { artifactId: story.id, version: story.backlogRevision, title: story.title,
        body: story.body, reason: input.reason, actorUserId, metadata: { clarificationId: row.id, impact: input.impact, rationale: input.rationale } } });
      const storyChanged = await db.artifactLayer.updateMany({ where: { id: story.id, backlogRevision: story.backlogRevision }, data: { backlogRevision: { increment: 1 } } });
      if (storyChanged.count !== 1) throw new BusinessError("The linked story changed. Reload before recording this impact.", 409);
    }
    if (input.action === "answer" && input.suggestionId) {
      const suggestion = await db.clarificationAiSuggestion.findFirst({ where: { id: input.suggestionId, clarificationId: row.id, status: "proposed" } });
      if (!suggestion) throw new BusinessError("The AI draft is no longer available.", 409);
      await db.clarificationAiSuggestion.update({ where: { id: suggestion.id }, data: { status: "used", actedByUserId: actorUserId, actedAt: new Date() } });
    }
    await auditInitiative(row.initiativeId, `clarification.${input.action}`, { clarificationId: row.id, reason: input.reason, impact: input.action === "answer" ? input.impact : row.impact, fromRevision: row.revision, toRevision: row.revision + 1,
      followUpRequestId: createdFollowUpRequestId ?? row.followUpRequestId });
    return db.inSprintClarification.findUniqueOrThrow({ where: { id: row.id }, include: clarificationInclude });
  });
}

export async function dismissClarificationSuggestion(suggestionId: string, actorUserId: string) {
  return withTransaction(async () => {
    const suggestion = await db.clarificationAiSuggestion.findUnique({ where: { id: suggestionId }, include: { clarification: { select: { initiativeId: true } } } });
    if (!suggestion) throw new BusinessError("AI draft not found.", 404);
    if (suggestion.status !== "proposed") throw new BusinessError("This AI draft has already been acted on.", 409);
    const saved = await db.clarificationAiSuggestion.update({ where: { id: suggestion.id }, data: { status: "dismissed", actedByUserId: actorUserId, actedAt: new Date() } });
    await auditInitiative(suggestion.clarification.initiativeId, "clarification.ai_draft_dismissed", { clarificationId: suggestion.clarificationId, suggestionId });
    return saved;
  });
}

