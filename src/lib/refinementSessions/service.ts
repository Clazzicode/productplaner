import type { Prisma, RefinementSession } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import type {
  RefinementActionCreate, RefinementDecisionCreate, RefinementItemUpdate,
  RefinementQuestionCreate, RefinementSessionCreate, RefinementSessionUpdate,
} from "./model";

const sessionSnapshot = (session: RefinementSession) => ({
  title: session.title,
  scheduledAt: session.scheduledAt?.toISOString() ?? null,
  status: session.status,
  facilitatorUserId: session.facilitatorUserId,
  purpose: session.purpose,
  agenda: session.agenda,
  notes: session.notes,
  summary: session.summary,
  startedAt: session.startedAt?.toISOString() ?? null,
  completedAt: session.completedAt?.toISOString() ?? null,
  revision: session.revision,
});

async function requireMember(organizationId: string, userId: string | null | undefined) {
  if (!userId) return;
  const member = await db.organizationMember.findFirst({ where: { organizationId, status: "active", user: { id: userId } }, select: { id: true } });
  if (!member) throw new BusinessError("The selected owner is not an active organization member.", 422);
}

async function scopedSession(sessionId: string) {
  const session = await db.refinementSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new BusinessError("Refinement session not found.", 404);
  return session;
}

async function bumpSession(session: RefinementSession, reason: string, actorUserId: string, nextData: Prisma.InputJsonObject) {
  await db.refinementSessionRevision.create({ data: {
    organizationId: session.organizationId, sessionId: session.id,
    fromRevision: session.revision, toRevision: session.revision + 1,
    previousData: sessionSnapshot(session), nextData, reason, actorUserId,
  } });
  const changed = await db.refinementSession.updateMany({ where: { id: session.id, revision: session.revision }, data: { revision: { increment: 1 } } });
  if (changed.count !== 1) throw new BusinessError("This refinement session changed. Reload before saving.", 409);
}

export async function createRefinementSession(initiativeId: string, input: RefinementSessionCreate, actorUserId: string) {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true, projectId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    await requireMember(initiative.organizationId, input.facilitatorUserId);
    const uniqueStories = [...new Set(input.storyIds)];
    const uniqueBugs = [...new Set(input.bugIds)];
    const [storyCount, bugCount] = await Promise.all([
      db.artifactLayer.count({ where: { id: { in: uniqueStories }, type: "story", archivedAt: null, prototype: { initiativeId } } }),
      db.bugPlanningRecord.count({ where: { id: { in: uniqueBugs }, initiativeId, archivedAt: null } }),
    ]);
    if (storyCount !== uniqueStories.length || bugCount !== uniqueBugs.length) throw new BusinessError("One or more selected refinement items do not belong to this initiative.", 422);
    const session = await db.refinementSession.create({ data: {
      organizationId: initiative.organizationId, projectId: initiative.projectId, initiativeId,
      title: input.title, scheduledAt: input.scheduledAt ?? null,
      facilitatorUserId: input.facilitatorUserId ?? null,
      purpose: input.purpose, agenda: input.agenda, createdByUserId: actorUserId,
      items: { create: [
        ...uniqueStories.map((storyId, order) => ({ storyId, order })),
        ...uniqueBugs.map((bugId, offset) => ({ bugId, order: uniqueStories.length + offset })),
      ] },
    }, include: { items: true } });
    await auditInitiative(initiativeId, "refinement_session.created", { sessionId: session.id, itemCount: session.items.length });
    return session;
  });
}

export async function updateRefinementSession(sessionId: string, input: RefinementSessionUpdate, actorUserId: string) {
  return withTransaction(async () => {
    const current = await scopedSession(sessionId);
    if (current.revision !== input.expectedRevision) throw new BusinessError("This refinement session changed. Reload before saving.", 409);
    await requireMember(current.organizationId, input.facilitatorUserId);
    const now = new Date();
    const changes = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.facilitatorUserId !== undefined ? { facilitatorUserId: input.facilitatorUserId } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.agenda !== undefined ? { agenda: input.agenda } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.status === "in_progress" && !current.startedAt ? { startedAt: now } : {}),
      ...(input.status === "completed" ? { completedAt: now } : input.status ? { completedAt: null } : {}),
    };
    const previous = sessionSnapshot(current);
    const next = {
      ...previous,
      title: input.title ?? previous.title,
      scheduledAt: input.scheduledAt === undefined ? previous.scheduledAt : input.scheduledAt?.toISOString() ?? null,
      facilitatorUserId: input.facilitatorUserId === undefined ? previous.facilitatorUserId : input.facilitatorUserId,
      purpose: input.purpose ?? previous.purpose,
      agenda: input.agenda ?? previous.agenda,
      notes: input.notes ?? previous.notes,
      summary: input.summary ?? previous.summary,
      status: input.status ?? previous.status,
      startedAt: input.status === "in_progress" && !current.startedAt ? now.toISOString() : previous.startedAt,
      completedAt: input.status === "completed" ? now.toISOString() : input.status ? null : previous.completedAt,
      revision: current.revision + 1,
    };
    await db.refinementSessionRevision.create({ data: {
      organizationId: current.organizationId, sessionId,
      fromRevision: current.revision, toRevision: current.revision + 1,
      previousData: previous, nextData: next as Prisma.InputJsonObject,
      reason: input.reason, actorUserId,
    } });
    const changed = await db.refinementSession.updateMany({ where: { id: sessionId, revision: input.expectedRevision }, data: { ...changes, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new BusinessError("This refinement session changed. Reload before saving.", 409);
    const saved = await scopedSession(sessionId);
    await auditInitiative(current.initiativeId, `refinement_session.${input.status ?? "updated"}`, { sessionId, reason: input.reason, fromRevision: current.revision, toRevision: saved.revision });
    return saved;
  });
}

type SessionCommand =
  | { kind: "question"; input: RefinementQuestionCreate }
  | { kind: "decision"; input: RefinementDecisionCreate }
  | { kind: "action"; input: RefinementActionCreate }
  | { kind: "item"; input: RefinementItemUpdate };

export async function applyRefinementSessionCommand(sessionId: string, command: SessionCommand, actorUserId: string) {
  return withTransaction(async () => {
    const session = await scopedSession(sessionId);
    if (session.revision !== command.input.expectedRevision) throw new BusinessError("This refinement session changed. Reload before saving.", 409);
    let record: unknown;
    let reason: string;
    if (command.kind === "question") {
      await requireMember(session.organizationId, command.input.ownerUserId);
      record = await db.refinementSessionQuestion.create({ data: { sessionId, question: command.input.question, answer: command.input.answer, status: command.input.answer ? "answered" : "open", ownerUserId: command.input.ownerUserId ?? null, dueAt: command.input.dueAt ?? null } });
      reason = "Refinement question recorded";
    } else if (command.kind === "decision") {
      await requireMember(session.organizationId, command.input.decidedByUserId);
      record = await db.refinementSessionDecision.create({ data: { sessionId, title: command.input.title, rationale: command.input.rationale, decidedByUserId: command.input.decidedByUserId ?? actorUserId } });
      reason = "Refinement decision recorded";
    } else if (command.kind === "action") {
      await requireMember(session.organizationId, command.input.ownerUserId);
      record = await db.refinementSessionAction.create({ data: { sessionId, title: command.input.title, ownerUserId: command.input.ownerUserId ?? null, dueAt: command.input.dueAt ?? null } });
      reason = "Refinement action recorded";
    } else {
      const item = await db.refinementSessionItem.findFirst({ where: { id: command.input.itemId, sessionId } });
      if (!item) throw new BusinessError("Refinement item not found.", 404);
      const itemReason = command.input.reason;
      const changes = {
        ...(command.input.status !== undefined ? { status: command.input.status } : {}),
        ...(command.input.estimateBefore !== undefined ? { estimateBefore: command.input.estimateBefore } : {}),
        ...(command.input.estimateAfter !== undefined ? { estimateAfter: command.input.estimateAfter } : {}),
        ...(command.input.scopeChange !== undefined ? { scopeChange: command.input.scopeChange } : {}),
        ...(command.input.outcome !== undefined ? { outcome: command.input.outcome } : {}),
      };
      record = await db.refinementSessionItem.update({ where: { id: item.id }, data: changes });
      reason = itemReason;
    }
    await bumpSession(session, reason, actorUserId, { ...sessionSnapshot(session), operation: command.kind, revision: session.revision + 1 });
    await auditInitiative(session.initiativeId, `refinement_session.${command.kind}_recorded`, { sessionId, reason });
    return { record, revision: session.revision + 1 };
  });
}
