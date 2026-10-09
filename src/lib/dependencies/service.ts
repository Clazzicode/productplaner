import type { PlanningBlocker, Prisma, WorkDependency } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import type { BlockerCreate, BlockerUpdate, DependencyCreate, WorkTarget } from "./model";

const key = (target: WorkTarget) => `${target.type}:${target.id}`;

const targetColumns = (prefix: "predecessor" | "dependent", target: WorkTarget) => ({
  [`${prefix}CapabilityId`]: target.type === "feature" ? target.id : null,
  [`${prefix}StoryId`]: target.type === "story" ? target.id : null,
  [`${prefix}BugId`]: target.type === "bug" ? target.id : null,
  [`${prefix}SprintId`]: target.type === "sprint" ? target.id : null,
  [`${prefix}ReleaseId`]: target.type === "release" ? target.id : null,
});

const blockerColumns = (target: WorkTarget) => ({
  capabilityId: target.type === "feature" ? target.id : null,
  storyId: target.type === "story" ? target.id : null,
  bugId: target.type === "bug" ? target.id : null,
  sprintId: target.type === "sprint" ? target.id : null,
  releaseId: target.type === "release" ? target.id : null,
});

async function targetExists(initiativeId: string, target: WorkTarget) {
  if (target.type === "feature") return Boolean(await db.capability.findFirst({ where: { id: target.id, intakeAnswerSet: { initiativeId } }, select: { id: true } }));
  if (target.type === "story") return Boolean(await db.artifactLayer.findFirst({ where: { id: target.id, type: "story", prototype: { initiativeId } }, select: { id: true } }));
  if (target.type === "bug") return Boolean(await db.bugPlanningRecord.findFirst({ where: { id: target.id, initiativeId }, select: { id: true } }));
  if (target.type === "sprint") return Boolean(await db.sprint.findFirst({ where: { id: target.id, prototype: { initiativeId } }, select: { id: true } }));
  return Boolean(await db.release.findFirst({ where: { id: target.id, prototype: { initiativeId } }, select: { id: true } }));
}

function dependencyEndpoints(row: WorkDependency): [string, string] {
  const endpoint = (prefix: "predecessor" | "dependent") => {
    const values: [WorkTarget["type"], string | null][] = [
      ["feature", row[`${prefix}CapabilityId`]], ["story", row[`${prefix}StoryId`]], ["bug", row[`${prefix}BugId`]],
      ["sprint", row[`${prefix}SprintId`]], ["release", row[`${prefix}ReleaseId`]],
    ];
    const found = values.find(([, id]) => id);
    return found ? `${found[0]}:${found[1]}` : "invalid";
  };
  return [endpoint("predecessor"), endpoint("dependent")];
}

export function createsDependencyCycle(existing: [string, string][], predecessor: string, dependent: string) {
  const graph = new Map<string, string[]>();
  for (const [from, to] of existing) graph.set(from, [...(graph.get(from) ?? []), to]);
  const stack = [dependent]; const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!; if (current === predecessor) return true; if (seen.has(current)) continue; seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

export async function createWorkDependency(initiativeId: string, input: DependencyCreate, actorUserId: string) {
  return withTransaction(async () => {
    if (key(input.predecessor) === key(input.dependent)) throw new BusinessError("A planning item cannot depend on itself.", 422);
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    if (!await targetExists(initiativeId, input.predecessor) || !await targetExists(initiativeId, input.dependent)) throw new BusinessError("Both dependency items must belong to this initiative.", 422);
    const existing = await db.workDependency.findMany({ where: { initiativeId } });
    const endpoints = existing.map(dependencyEndpoints);
    if (endpoints.some(([from, to]) => from === key(input.predecessor) && to === key(input.dependent))) throw new BusinessError("This dependency already exists.", 409);
    if (createsDependencyCycle(endpoints, key(input.predecessor), key(input.dependent))) throw new BusinessError("This dependency would create a cycle.", 422);
    const dependency = await db.workDependency.create({ data: {
      organizationId: initiative.organizationId, initiativeId, dependencyType: input.dependencyType,
      description: input.description, createdByUserId: actorUserId,
      ...targetColumns("predecessor", input.predecessor), ...targetColumns("dependent", input.dependent),
    } as Prisma.WorkDependencyUncheckedCreateInput });
    await auditInitiative(initiativeId, "dependency.created", { dependencyId: dependency.id, predecessor: key(input.predecessor), dependent: key(input.dependent) });
    return dependency;
  });
}

const blockerSnapshot = (row: PlanningBlocker) => ({ status: row.status, ownerUserId: row.ownerUserId, dueAt: row.dueAt?.toISOString() ?? null, resolution: row.resolution, resolvedByUserId: row.resolvedByUserId, resolvedAt: row.resolvedAt?.toISOString() ?? null, overrideByUserId: row.overrideByUserId, overrideReason: row.overrideReason, revision: row.revision });

export async function createPlanningBlocker(initiativeId: string, input: BlockerCreate, actorUserId: string) {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    if (!await targetExists(initiativeId, input.target)) throw new BusinessError("The blocked item does not belong to this initiative.", 422);
    if (input.ownerUserId && !await db.organizationMember.findFirst({ where: { organizationId: initiative.organizationId, status: "active", user: { id: input.ownerUserId } }, select: { id: true } })) throw new BusinessError("The blocker owner is not an active organization member.", 422);
    const blocker = await db.planningBlocker.create({ data: { organizationId: initiative.organizationId, initiativeId, blockerType: input.blockerType, description: input.description, ownerUserId: input.ownerUserId ?? null, dueAt: input.dueAt ?? null, createdByUserId: actorUserId, ...blockerColumns(input.target) } });
    await auditInitiative(initiativeId, "blocker.created", { blockerId: blocker.id, target: key(input.target) });
    return blocker;
  });
}

export async function updatePlanningBlocker(blockerId: string, input: BlockerUpdate, actorUserId: string, canOverride: boolean) {
  const initial = await db.planningBlocker.findUnique({ where: { id: blockerId } }); if (!initial) throw new BusinessError("Blocker not found.", 404);
  return withTransaction(async () => {
    const current = await db.planningBlocker.findUniqueOrThrow({ where: { id: blockerId } });
    if (current.revision !== input.expectedRevision) throw new BusinessError("This blocker changed. Reload before saving.", 409);
    if (input.status === "accepted" && !canOverride) throw new BusinessError("Only an organization owner or administrator can accept an unresolved blocker.", 403);
    const now = new Date(); const changes = {
      ...(input.status !== undefined ? { status: input.status } : {}), ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}), ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.status === "resolved" ? { resolvedByUserId: actorUserId, resolvedAt: now } : {}),
      ...(input.status === "accepted" ? { overrideByUserId: actorUserId, overrideReason: input.overrideReason ?? "" } : {}),
    };
    const next = { ...blockerSnapshot(current), ...changes, dueAt: input.dueAt === undefined ? blockerSnapshot(current).dueAt : input.dueAt?.toISOString() ?? null, resolvedAt: input.status === "resolved" ? now.toISOString() : blockerSnapshot(current).resolvedAt, revision: current.revision + 1 };
    await db.planningBlockerRevision.create({ data: { organizationId: current.organizationId, blockerId, fromRevision: current.revision, toRevision: current.revision + 1, previousData: blockerSnapshot(current), nextData: next as Prisma.InputJsonObject, reason: input.reason, actorUserId } });
    const changed = await db.planningBlocker.updateMany({ where: { id: blockerId, revision: input.expectedRevision }, data: { ...changes, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new BusinessError("This blocker changed. Reload before saving.", 409);
    await auditInitiative(current.initiativeId, `blocker.${input.status ?? "updated"}`, { blockerId, reason: input.reason });
    return db.planningBlocker.findUniqueOrThrow({ where: { id: blockerId } });
  });
}

export async function readinessObstacles(initiativeId: string, target: WorkTarget) {
  const columns = blockerColumns(target);
  const blockers = await db.planningBlocker.findMany({ where: { initiativeId, ...columns, status: { in: ["open", "in_progress"] } }, select: { id: true, description: true, status: true } });
  const dependencies = (await db.workDependency.findMany({ where: { initiativeId } })).filter((row) => dependencyEndpoints(row)[1] === key(target));
  return { blockers, dependencies };
}
