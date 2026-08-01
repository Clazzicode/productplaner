import { db } from "@/lib/db";
import { buildCostModel, type CostModel } from "@/lib/generation/cost";
import { loadIntakeInput } from "@/lib/generation/engine";
import { computePriorityScore } from "@/lib/generation/scoring";
import type { TraceCapabilityView, TraceIntakeView } from "@/lib/trace";
import type { LayerType } from "@/lib/generation/types";

/** Shared workspace loader: initiative, prototype, locks, and the intake
 * views the trace drawer needs. Pages layer their own artifact queries on top. */
export async function loadWorkspace(initiativeId: string) {
  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    include: {
      prototype: { include: { layerLocks: true } },
      syncConnections: true,
      intakeAnswerSet: {
        include: {
          capabilities: {
            orderBy: { order: "asc" },
            include: { dependsOnEdges: { include: { toCapability: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  if (!initiative || !initiative.prototype || !initiative.intakeAnswerSet) return null;

  const intake = initiative.intakeAnswerSet;
  const intakeView: TraceIntakeView = {
    problemStatement: intake.problemStatement,
    targetCustomer: intake.targetCustomer,
    outcomeStatement: intake.outcomeStatement,
    outcomeMetric: intake.outcomeMetric,
    teamSize: intake.teamSize,
    sprintLengthWeeks: intake.sprintLengthWeeks,
    velocityPerPersonPerSprint: intake.velocityPerPersonPerSprint,
    capacityBufferPercent: intake.capacityBufferPercent,
    mvpCount: intake.capabilities.filter((c) => c.isMvp).length,
    totalCount: intake.capabilities.length,
  };

  const capViewById = new Map<string, TraceCapabilityView>(
    intake.capabilities.map((c) => [
      c.id,
      {
        name: c.name,
        isMvp: c.isMvp,
        effortSize: c.effortSize,
        businessValue: c.businessValue,
        riskLevel: c.riskLevel,
        dependsOnNames: c.dependsOnEdges.map((e) => e.toCapability.name),
      },
    ]),
  );

  const locks = initiative.prototype.layerLocks;
  const isLocked = (layerType: LayerType) =>
    locks.find((l) => l.layerType === layerType)?.state === "locked";

  return {
    initiative,
    prototype: initiative.prototype,
    intakeView,
    capViewById,
    locks,
    isLocked,
    jira: initiative.syncConnections.find((c) => c.tool === "jira") ?? null,
  };
}

export interface WorkspaceCostContext {
  model: CostModel;
  pointsByCapability: Map<string, number>;
  costByCapability: Map<string, number>; // §25 capability cost
  priorityByCapability: Map<string, number>; // §5 priority score
}

/**
 * Read-time cost/priority context for workspace pages — computed live from
 * the intake, current stories and sprints (never persisted, like the
 * capacity forecast).
 */
export async function loadCostContext(
  initiativeId: string,
  prototypeId: string,
): Promise<WorkspaceCostContext> {
  const [initiative, sprintCount, stories, intakeInput] = await Promise.all([
    db.initiative.findUnique({
      where: { id: initiativeId },
      select: { budget: true, averageHourlyRate: true },
    }),
    db.sprint.count({ where: { prototypeId } }),
    db.artifactLayer.findMany({
      where: { prototypeId, type: "story" },
      select: { points: true, sourceCapabilityId: true },
    }),
    loadIntakeInput(initiativeId),
  ]);

  const totalPlannedPoints = stories.reduce((n, s) => n + (s.points ?? 1), 0);
  const model = buildCostModel({
    capacity: intakeInput,
    averageHourlyRate: initiative?.averageHourlyRate,
    budget: initiative?.budget,
    totalSprints: sprintCount,
    totalPlannedPoints,
  });

  const pointsByCapability = new Map<string, number>();
  for (const s of stories) {
    if (!s.sourceCapabilityId) continue;
    pointsByCapability.set(
      s.sourceCapabilityId,
      (pointsByCapability.get(s.sourceCapabilityId) ?? 0) + (s.points ?? 1),
    );
  }
  const costByCapability = new Map<string, number>(
    [...pointsByCapability].map(([id, pts]) => [id, pts * model.costPerStoryPoint]),
  );

  const dependedOnBy = new Map<string, number>();
  for (const cap of intakeInput.capabilities) {
    for (const d of cap.dependsOn) dependedOnBy.set(d, (dependedOnBy.get(d) ?? 0) + 1);
  }
  const priorityByCapability = new Map<string, number>(
    intakeInput.capabilities.map((c) => [c.id, computePriorityScore(c, dependedOnBy.get(c.id) ?? 0)]),
  );

  return { model, pointsByCapability, costByCapability, priorityByCapability };
}

export async function artifactCounts(prototypeId: string) {
  const grouped = await db.artifactLayer.groupBy({
    by: ["type"],
    where: { prototypeId },
    _count: { _all: true },
  });
  const count = (t: string) => grouped.find((g) => g.type === t)?._count._all ?? 0;
  return {
    features: count("feature"),
    epics: count("epic"),
    stories: count("story"),
    acs: count("acceptance_criterion"),
  };
}
