import { db } from "@/lib/db";
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
