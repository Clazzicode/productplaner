import type { Prisma, PriorityDecision } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { effortRating, requestSchema } from "@/lib/requests/model";
import {
  calculateDependencyAdjustedScore,
  calculatePriorityScore,
  priorityDecisionCommand,
  priorityFactorsSchema,
  type PriorityDecisionInput,
  type PriorityDecisionRecord,
} from "./model";

const actorSelect = { id: true, name: true, email: true } as const;

function record(row: PriorityDecision & { changedByUser?: { id: string; name: string; email: string } | null }): PriorityDecisionRecord {
  return {
    id: row.id,
    entityType: row.entityType as PriorityDecisionRecord["entityType"],
    entityId: row.entityId,
    revision: row.revision,
    score: row.score,
    dependencyAdjustedScore: row.dependencyAdjustedScore,
    moscow: row.moscow as PriorityDecisionRecord["moscow"],
    roadmapLane: row.roadmapLane as PriorityDecisionRecord["roadmapLane"],
    reason: row.reason,
    source: row.source as PriorityDecisionRecord["source"],
    factors: priorityFactorsSchema.parse(row.factors),
    recommendationItemId: row.recommendationItemId,
    changedBy: row.changedByUser ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPriorityHistory(initiativeId: string, entityType?: string, entityId?: string): Promise<PriorityDecisionRecord[]> {
  const rows = await db.priorityDecision.findMany({
    where: { initiativeId, ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
    include: { changedByUser: { select: actorSelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: entityId ? 100 : 1000,
  });
  return rows.map(record);
}

export async function latestPriorityDecisionMap(initiativeId: string): Promise<Map<string, PriorityDecisionRecord>> {
  const history = await listPriorityHistory(initiativeId);
  const latest = new Map<string, PriorityDecisionRecord>();
  for (const decision of history) {
    const key = `${decision.entityType}:${decision.entityId}`;
    if (!latest.has(key)) latest.set(key, decision);
  }
  return latest;
}

export async function savePriorityDecision(
  initiativeId: string,
  input: PriorityDecisionInput,
  actorUserId: string,
): Promise<PriorityDecisionRecord> {
  const command = priorityDecisionCommand.parse(input);
  const normalizedFactors = {
    ...command.factors,
    effort: effortRating(command.factors.effortPoints),
  };
  return withPlanningMutation(initiativeId, "priority.decision_recorded", async () => {
    const [initiative, plan] = await Promise.all([
      db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } }),
      db.prototype.findUnique({ where: { initiativeId }, select: { approvedAt: true } }),
    ]);
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    if (plan?.approvedAt) throw new BusinessError("Reopen the approved plan before changing priority.");

    let dependsOnCount = 0;
    let blocksCount = 0;
    let appliedLane = command.roadmapLane;
    let requestRevision: { previous: Prisma.JsonValue; next: Prisma.InputJsonObject; from: number; to: number } | null = null;

    if (command.entityType === "request") {
      const row = await db.planningRequest.findFirst({ where: { id: command.entityId, initiativeId } });
      if (!row) throw new BusinessError("Request not found.", 404);
      if (row.revision !== command.expectedRevision) throw new BusinessError("This request changed. Reload before setting priority.", 409);
      const request = requestSchema.parse(row.data);
      const next = requestSchema.parse({
        ...request,
        priority: {
          ...request.priority,
          businessValue: normalizedFactors.businessValue,
          urgency: normalizedFactors.urgency,
          userNeed: normalizedFactors.userImpact,
          dependencyImpact: normalizedFactors.dependencyImpact,
          risk: normalizedFactors.risk,
          effort: normalizedFactors.effort,
          effortPoints: normalizedFactors.effortPoints,
          moscow: command.moscow,
          bugSeverity: normalizedFactors.bugSeverity,
          decision: command.roadmapLane === "unscheduled" ? "untriaged" : command.roadmapLane,
          reason: command.reason,
        },
      });
      await db.planningRequest.update({
        where: { id: row.id, revision: command.expectedRevision },
        data: { data: next as Prisma.InputJsonObject, revision: { increment: 1 } },
      });
      requestRevision = { previous: row.data, next: next as Prisma.InputJsonObject, from: row.revision, to: row.revision + 1 };
    } else if (command.entityType === "feature") {
      const row = await db.capability.findFirst({
        where: { id: command.entityId, intakeAnswerSet: { initiativeId } },
        include: { _count: { select: { dependsOnEdges: true, dependedOnBy: true } } },
      });
      if (!row) throw new BusinessError("Feature not found.", 404);
      if (row.backlogRevision !== command.expectedRevision) throw new BusinessError("This feature changed. Reload before setting priority.", 409);
      dependsOnCount = row._count.dependsOnEdges;
      blocksCount = row._count.dependedOnBy;
      await db.capability.update({
        where: { id: row.id, backlogRevision: command.expectedRevision },
        data: { backlogLane: command.roadmapLane, backlogRevision: { increment: 1 } },
      });
    } else {
      const row = await db.artifactLayer.findFirst({
        where: { id: command.entityId, type: "story", prototype: { initiativeId } },
        include: { sourceCapability: { include: { _count: { select: { dependsOnEdges: true, dependedOnBy: true } } } } },
      });
      if (!row) throw new BusinessError("Story not found.", 404);
      if (row.backlogRevision !== command.expectedRevision) throw new BusinessError("This story changed. Reload before setting priority.", 409);
      dependsOnCount = row.sourceCapability?._count.dependsOnEdges ?? 0;
      blocksCount = row.sourceCapability?._count.dependedOnBy ?? 0;
      const inheritedLane = row.sourceCapability?.backlogLane ?? "unscheduled";
      if (command.roadmapLane !== inheritedLane) throw new BusinessError("Stories inherit roadmap placement from their feature.");
      appliedLane = inheritedLane as PriorityDecisionRecord["roadmapLane"];
      await db.artifactLayer.update({
        where: { id: row.id, backlogRevision: command.expectedRevision },
        data: { backlogRevision: { increment: 1 } },
      });
    }

    let recommendation = null;
    if (command.source === "ai") {
      recommendation = await db.aiAssistItem.findFirst({
        where: {
          id: command.recommendationItemId!, initiativeId, organizationId: initiative.organizationId,
          actionKey: "RECOMMEND_PRIORITY", targetType: `priority_${command.entityType}`,
          targetId: command.entityId, status: { in: ["proposed", "stale"] },
        },
      });
      if (!recommendation) throw new BusinessError("The AI recommendation is unavailable or belongs to different work.", 409);
    }

    const previous = await db.priorityDecision.findFirst({
      where: { entityType: command.entityType, entityId: command.entityId },
      orderBy: { revision: "desc" },
    });
    const score = calculatePriorityScore(normalizedFactors);
    const saved = await db.priorityDecision.create({
      data: {
        organizationId: initiative.organizationId,
        initiativeId,
        entityType: command.entityType,
        entityId: command.entityId,
        revision: (previous?.revision ?? 0) + 1,
        score,
        dependencyAdjustedScore: calculateDependencyAdjustedScore(score, dependsOnCount, blocksCount),
        moscow: command.moscow,
        roadmapLane: appliedLane,
        reason: command.reason,
        source: command.source,
        factors: normalizedFactors as Prisma.InputJsonObject,
        changedByUserId: actorUserId,
        recommendationItemId: command.recommendationItemId ?? null,
      },
      include: { changedByUser: { select: actorSelect } },
    });

    if (requestRevision) {
      await db.requestRevision.create({ data: {
        organizationId: initiative.organizationId,
        requestId: command.entityId,
        fromRevision: requestRevision.from,
        toRevision: requestRevision.to,
        previousData: requestRevision.previous as Prisma.InputJsonValue,
        nextData: requestRevision.next,
        reason: command.reason,
        changedByUserId: actorUserId,
        sourceAiAssistItemId: command.recommendationItemId ?? null,
      } });
    }
    if (recommendation) {
      await db.aiAssistItem.update({ where: { id: recommendation.id }, data: {
        status: "applied", appliedByUserId: actorUserId, appliedAt: new Date(),
      } });
    }
    await auditInitiative(initiativeId, "priority.changed", {
      entityType: command.entityType, entityId: command.entityId,
      previousPriorityDecisionId: previous?.id ?? null, priorityDecisionId: saved.id,
      previousScore: previous?.score ?? null, score: saved.score,
      dependencyAdjustedScore: saved.dependencyAdjustedScore,
      moscow: saved.moscow, roadmapLane: saved.roadmapLane,
      reason: saved.reason, source: saved.source,
    });
    return record(saved);
  }, true);
}
