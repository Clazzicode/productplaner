import { PHASE_NAMES, RELEASE_NAMES } from "./constants";
import { computeEffectiveCapacity } from "./cost";
import { buildNarrativeContext, decomposeCapability } from "./decompose";
import { orderByDependencyAndPriority } from "./dependencyGraph";
import type {
  CapabilityInput,
  GeneratedPlan,
  IntakeInput,
  PlannedPhase,
  PlannedRelease,
  PlannedSprint,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
const addWeeks = (d: Date, weeks: number): Date => new Date(d.getTime() + weeks * 7 * DAY);

/**
 * Phase partitioning (Q4 + Q8):
 *   Phase 1 = MVP capabilities
 *   Phase 2 = non-MVP with high/critical business value
 *   Phase 3 = remaining non-MVP
 * Then dependency closure: a capability every earlier-phase capability depends
 * on is promoted into that earlier phase, so dependencies never point forward.
 */
export function partitionPhases(
  capabilities: CapabilityInput[],
): Map<number, CapabilityInput[]> {
  const phaseOf = new Map<string, number>();
  for (const cap of capabilities) {
    // Explicit label check: high/critical → phase 2 regardless of how the
    // 1–5 VALUE_SCORE numbering shifts.
    const highValue = cap.businessValue === "high" || cap.businessValue === "critical";
    phaseOf.set(cap.id, cap.isMvp ? 1 : highValue ? 2 : 3);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const cap of capabilities) {
      for (const depId of cap.dependsOn) {
        const capPhase = phaseOf.get(cap.id);
        const depPhase = phaseOf.get(depId);
        if (capPhase !== undefined && depPhase !== undefined && depPhase > capPhase) {
          phaseOf.set(depId, capPhase);
          changed = true;
        }
      }
    }
  }

  const phases = new Map<number, CapabilityInput[]>();
  for (const n of [1, 2, 3]) {
    const members = capabilities.filter((c) => phaseOf.get(c.id) === n);
    if (members.length > 0) phases.set(n, orderByDependencyAndPriority(members));
  }
  return phases;
}

export interface SprintAssignable {
  points: number;
  sprintNumber: number;
}

interface PackableStory {
  story: SprintAssignable;
  phaseNumber: number;
}

/**
 * Priority-preserving greedy sprint packing (FR-07 dual mapping):
 * stories are taken strictly in roadmap order (never reshuffled to pack
 * tighter), a sprint never mixes two phases (so Releases cut cleanly at phase
 * boundaries), and a story larger than a whole sprint gets its own
 * over-allocated sprint rather than being dropped.
 */
export function packSprints(args: {
  stories: PackableStory[];
  capacityPoints: number;
  sprintLengthWeeks: number;
  startDate: Date;
}): PlannedSprint[] {
  const { stories, capacityPoints, sprintLengthWeeks, startDate } = args;
  const sprints: PlannedSprint[] = [];
  let current: PlannedSprint | null = null;
  let remaining = 0;

  const openSprint = (phaseNumber: number): PlannedSprint => {
    const n = sprints.length + 1;
    const start = addWeeks(startDate, (n - 1) * sprintLengthWeeks);
    const sprint: PlannedSprint = {
      sprintNumber: n,
      phaseNumber,
      startDate: start,
      endDate: new Date(addWeeks(start, sprintLengthWeeks).getTime() - DAY),
      capacityPoints,
      plannedPoints: 0,
    };
    sprints.push(sprint);
    remaining = capacityPoints;
    return sprint;
  };

  for (const { story, phaseNumber } of stories) {
    const needsNewSprint =
      current === null ||
      current.phaseNumber !== phaseNumber || // hard break at phase boundaries
      (story.points > remaining && current.plannedPoints > 0);
    if (needsNewSprint) current = openSprint(phaseNumber);
    story.sprintNumber = current!.sprintNumber;
    current!.plannedPoints += story.points;
    remaining -= story.points;
  }

  return sprints;
}

/** The full deterministic pipeline: intake answers → connected plan. */
export function buildPlan(input: IntakeInput): GeneratedPlan {
  const capacityPoints = computeEffectiveCapacity(input);
  const ctx = buildNarrativeContext(input);
  const phasePartition = partitionPhases(input.capabilities);

  // Decompose every capability under its phase, in phase order.
  const phases: PlannedPhase[] = [...phasePartition.entries()].map(
    ([phaseNumber, caps]) => ({
      phaseNumber,
      name: PHASE_NAMES[phaseNumber],
      startDate: input.startDate, // refined from sprint spans below
      endDate: input.startDate,
      capabilityIds: caps.map((c) => c.id),
      features: caps.map((c) => decomposeCapability(c, ctx)),
    }),
  );

  // Flatten stories in strict roadmap order and pack them into sprints.
  const packable: PackableStory[] = phases.flatMap((phase) =>
    phase.features.flatMap((f) =>
      f.epics.flatMap((e) => e.stories.map((story) => ({ story, phaseNumber: phase.phaseNumber }))),
    ),
  );
  const sprints = packSprints({
    stories: packable,
    capacityPoints,
    sprintLengthWeeks: input.sprintLengthWeeks,
    startDate: input.startDate,
  });

  // Phase dates come from the actual sprint spans (the same capacity number
  // drives both the waterfall timeline and the sprint cadence).
  for (const phase of phases) {
    const phaseSprints = sprints.filter((s) => s.phaseNumber === phase.phaseNumber);
    if (phaseSprints.length > 0) {
      phase.startDate = phaseSprints[0].startDate;
      phase.endDate = phaseSprints[phaseSprints.length - 1].endDate;
    }
  }

  // One release per phase, cut exactly at the phase's sprints.
  const releases: PlannedRelease[] = phases.map((phase, i) => ({
    order: i + 1,
    name: RELEASE_NAMES[phase.phaseNumber] ?? `Release ${i + 1}`,
    phaseNumber: phase.phaseNumber,
    targetDate: phase.endDate,
  }));

  return {
    capacityPoints,
    roadmapTitle: `${input.initiativeName} — Roadmap`,
    roadmapBody: `Sequenced against the outcome: ${input.outcomeStatement.trim()}${
      input.outcomeMetric.trim() ? ` (measured by: ${input.outcomeMetric.trim()})` : ""
    }. Anchored to the problem: ${input.problemStatement.trim()}`,
    phases,
    sprints,
    releases,
  };
}
