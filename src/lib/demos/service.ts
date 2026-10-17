import { Prisma, type DemoItem } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import type { DemoAgendaReorderInput, DemoCommandInput, DemoCreateInput } from "./model";

export const demoInclude = {
  sprint: { select: { id: true, sprintNumber: true } }, story: { select: { id: true, title: true } },
  bug: { include: { request: { select: { data: true } } } }, capability: { select: { id: true, name: true } },
  presenter: { select: { id: true, displayName: true, email: true } },
  revisions: { orderBy: { createdAt: "desc" as const }, take: 30, include: { actor: { select: { name: true } } } },
  aiSuggestions: { orderBy: { createdAt: "desc" as const }, take: 10 },
} satisfies Prisma.DemoItemInclude;

function snapshot(row: DemoItem): Prisma.InputJsonObject {
  return { title: row.title, purpose: row.purpose, presenterStakeholderId: row.presenterStakeholderId,
    presenterNameSnapshot: row.presenterNameSnapshot, status: row.status, readinessReason: row.readinessReason,
    blockingReason: row.blockingReason, overrideReason: row.overrideReason, notes: row.notes, completedWork: row.completedWork,
    plannedOrder: row.plannedOrder, repeatReason: row.repeatReason, evidenceLinks: row.evidenceLinks as Prisma.InputJsonValue,
    carryoverSprintId: row.carryoverSprintId, carryoverReason: row.carryoverReason, decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt?.toISOString() ?? null, revision: row.revision };
}

async function presenter(organizationId: string, stakeholderId: string | null | undefined) {
  if (!stakeholderId) return null;
  const row = await db.stakeholderContact.findFirst({ where: { id: stakeholderId, organizationId, archivedAt: null }, select: { id: true, displayName: true } });
  if (!row) throw new BusinessError("Choose an active stakeholder from this organization as the presenter.", 422);
  return row;
}

async function committedTarget(initiativeId: string, sprintId: string, storyId?: string | null, bugId?: string | null) {
  const plan = await db.sprintPlan.findFirst({ where: { initiativeId, sprintId, status: "committed" }, include: { sprint: { select: { sprintNumber: true } }, items: { select: { storyId: true, bugId: true } } } });
  if (!plan) throw new BusinessError("Demo items require a committed sprint plan.", 422);
  if (!plan.items.some((item) => storyId ? item.storyId === storyId : item.bugId === bugId)) throw new BusinessError("The selected work is not committed to this sprint.", 422);
  return plan;
}

export async function createDemoItem(initiativeId: string, input: DemoCreateInput, actorUserId: string) {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    await committedTarget(initiativeId, input.sprintId, input.storyId, input.bugId);
    const assigned = await presenter(initiative.organizationId, input.presenterStakeholderId);
    try {
      const row = await db.demoItem.create({ data: { organizationId: initiative.organizationId, initiativeId, sprintId: input.sprintId,
        storyId: input.storyId ?? null, bugId: input.bugId ?? null, capabilityId: input.capabilityId ?? null,
        title: input.title, purpose: input.purpose, presenterStakeholderId: assigned?.id ?? null,
        presenterNameSnapshot: assigned?.displayName ?? "", notes: input.notes, completedWork: input.completedWork,
        plannedOrder: input.plannedOrder, repeatReason: input.repeatReason, evidenceLinks: input.evidenceLinks,
        status: input.purpose || input.completedWork || assigned ? "preparing" : "proposed", createdByUserId: actorUserId }, include: demoInclude });
      await auditInitiative(initiativeId, "demo.created", { demoItemId: row.id, sprintId: row.sprintId, target: row.storyId ? `story:${row.storyId}` : `bug:${row.bugId}` });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BusinessError("This sprint work already has an active demo item. Add a repeat-demo reason to create another.", 409);
      throw error;
    }
  });
}

async function blockingEvidence(row: DemoItem) {
  const target = row.storyId ? { storyId: row.storyId } : { bugId: row.bugId! };
  const [blockers, clarifications] = await Promise.all([
    db.planningBlocker.count({ where: { initiativeId: row.initiativeId, status: { in: ["open", "in_progress"] }, OR: [target, { sprintId: row.sprintId }] } }),
    db.inSprintClarification.count({ where: { initiativeId: row.initiativeId, status: { in: ["open", "answered"] }, ...target } }),
  ]);
  return { blockers, clarifications };
}

export async function applyDemoCommand(id: string, input: DemoCommandInput, actorUserId: string, canDecide: boolean) {
  return withTransaction(async () => {
    const row = await db.demoItem.findUnique({ where: { id } });
    if (!row) throw new BusinessError("Demo item not found.", 404);
    if (row.revision !== input.expectedRevision) throw new BusinessError("This demo item changed. Reload before saving.", 409);
    if (input.action !== "update" && !canDecide) throw new BusinessError("Only an organization owner or administrator can make demo readiness and outcome decisions.", 403);
    let changes: Prisma.DemoItemUncheckedUpdateManyInput;
    let carryoverCreatedId: string | null = null;
    if (input.action === "update") {
      if (!canDecide && input.plannedOrder !== row.plannedOrder) throw new BusinessError("Only an organization owner or administrator can reorder the demo agenda.", 403);
      const assigned = await presenter(row.organizationId, input.presenterStakeholderId);
      changes = { title: input.title, purpose: input.purpose, presenterStakeholderId: assigned?.id ?? null,
        presenterNameSnapshot: assigned?.displayName ?? "", notes: input.notes, completedWork: input.completedWork,
        plannedOrder: input.plannedOrder, evidenceLinks: input.evidenceLinks,
        status: row.status === "proposed" && (input.purpose || input.completedWork || assigned) ? "preparing" : row.status };
    } else if (input.action === "decide") {
      if (input.status === "ready") {
        if (!row.purpose.trim() || !row.presenterNameSnapshot.trim() || !row.completedWork.trim()) throw new BusinessError("Add the demo purpose, presenter, and completed-work summary before marking this item ready.", 422);
        const blocked = await blockingEvidence(row);
        if ((blocked.blockers || blocked.clarifications) && input.overrideReason.trim().length < 5) throw new BusinessError(`Resolve ${blocked.blockers} blocker(s) and ${blocked.clarifications} clarification(s), or record an authorized override reason.`, 422);
      }
      if (input.status === "not_ready" && input.blockingReason.trim().length < 3) throw new BusinessError("Explain why this item is not ready.", 422);
      changes = { status: input.status, readinessReason: input.readinessReason, blockingReason: input.blockingReason,
        overrideReason: input.overrideReason, decidedByUserId: actorUserId, decidedAt: new Date() };
    } else if (input.action === "outcome") {
      if (input.status === "demonstrated" && row.status !== "ready") throw new BusinessError("Only a ready demo item can be marked demonstrated.", 409);
      changes = { status: input.status, notes: input.notes, decidedByUserId: actorUserId, decidedAt: new Date() };
    } else {
      if (!["ready", "not_ready", "skipped"].includes(row.status)) throw new BusinessError("Only decided or skipped demo work can be carried over.", 409);
      const targetPlan = await committedTarget(row.initiativeId, input.targetSprintId, row.storyId, row.bugId);
      const created = await db.demoItem.create({ data: { organizationId: row.organizationId, initiativeId: row.initiativeId,
        sprintId: input.targetSprintId, storyId: row.storyId, bugId: row.bugId, capabilityId: row.capabilityId,
        title: row.title, purpose: row.purpose, presenterStakeholderId: row.presenterStakeholderId,
        presenterNameSnapshot: row.presenterNameSnapshot, status: "proposed", completedWork: row.completedWork,
        repeatReason: `Carried over from Sprint ${targetPlan.sprint.sprintNumber}: ${input.carryoverReason}`,
        notes: row.notes, evidenceLinks: row.evidenceLinks as Prisma.InputJsonValue, createdByUserId: actorUserId } });
      carryoverCreatedId = created.id;
      changes = { status: "carried_over", carryoverSprintId: input.targetSprintId, carryoverReason: input.carryoverReason,
        decidedByUserId: actorUserId, decidedAt: new Date() };
    }
    const previous = snapshot(row); const nextRevision = row.revision + 1;
    const next = { ...previous, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])), revision: nextRevision } as Prisma.InputJsonObject;
    await db.demoItemRevision.create({ data: { organizationId: row.organizationId, demoItemId: row.id,
      fromRevision: row.revision, toRevision: nextRevision, previousData: previous, nextData: next, reason: input.reason, actorUserId } });
    const changed = await db.demoItem.updateMany({ where: { id: row.id, revision: row.revision }, data: { ...changes, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new BusinessError("This demo item changed. Reload before saving.", 409);
    if (input.action === "update" && input.suggestionId && input.suggestionKind) {
      const suggestion = await db.demoAiSuggestion.findFirst({ where: { id: input.suggestionId, demoItemId: row.id, kind: input.suggestionKind, status: "proposed" } });
      if (!suggestion) throw new BusinessError("The AI draft is no longer available.", 409);
      await db.demoAiSuggestion.update({ where: { id: suggestion.id }, data: { status: "used", actedByUserId: actorUserId, actedAt: new Date() } });
    }
    await auditInitiative(row.initiativeId, `demo.${input.action}`, { demoItemId: row.id, reason: input.reason,
      fromRevision: row.revision, toRevision: nextRevision, status: "status" in changes ? changes.status : row.status, carryoverCreatedId });
    return db.demoItem.findUniqueOrThrow({ where: { id: row.id }, include: demoInclude });
  });
}

export async function dismissDemoSuggestion(id: string, actorUserId: string) {
  return withTransaction(async () => {
    const suggestion = await db.demoAiSuggestion.findUnique({ where: { id }, include: { demoItem: { select: { initiativeId: true } } } });
    if (!suggestion) throw new BusinessError("AI draft not found.", 404);
    if (suggestion.status !== "proposed") throw new BusinessError("This AI draft has already been acted on.", 409);
    const saved = await db.demoAiSuggestion.update({ where: { id }, data: { status: "dismissed", actedByUserId: actorUserId, actedAt: new Date() } });
    await auditInitiative(suggestion.demoItem.initiativeId, "demo.ai_draft_dismissed", { demoItemId: suggestion.demoItemId, suggestionId: id });
    return saved;
  });
}

export async function reorderDemoAgenda(initiativeId: string, input: DemoAgendaReorderInput, actorUserId: string) {
  return withTransaction(async () => {
    const rows = await db.demoItem.findMany({ where: { initiativeId, sprintId: input.sprintId }, orderBy: [{ plannedOrder: "asc" }, { createdAt: "asc" }] });
    if (rows.length !== input.items.length || rows.some((row) => !input.items.some((item) => item.id === row.id))) {
      throw new BusinessError("The demo agenda changed. Reload before reordering it.", 409);
    }
    const expected = new Map(input.items.map((item, index) => [item.id, { revision: item.expectedRevision, plannedOrder: index }]));
    if (rows.some((row) => expected.get(row.id)?.revision !== row.revision)) {
      throw new BusinessError("The demo agenda changed. Reload before reordering it.", 409);
    }
    for (const row of rows) {
      const nextOrder = expected.get(row.id)!.plannedOrder;
      if (nextOrder === row.plannedOrder) continue;
      const nextRevision = row.revision + 1;
      await db.demoItemRevision.create({ data: { organizationId: row.organizationId, demoItemId: row.id,
        fromRevision: row.revision, toRevision: nextRevision, previousData: snapshot(row),
        nextData: { ...snapshot(row), plannedOrder: nextOrder, revision: nextRevision }, reason: input.reason, actorUserId } });
      const changed = await db.demoItem.updateMany({ where: { id: row.id, revision: row.revision, initiativeId, sprintId: input.sprintId }, data: { plannedOrder: nextOrder, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new BusinessError("The demo agenda changed. Reload before reordering it.", 409);
    }
    await auditInitiative(initiativeId, "demo.agenda_reordered", { sprintId: input.sprintId, orderedDemoItemIds: input.items.map((item) => item.id), reason: input.reason });
    return db.demoItem.findMany({ where: { initiativeId, sprintId: input.sprintId }, include: demoInclude, orderBy: [{ plannedOrder: "asc" }, { createdAt: "asc" }] });
  });
}
