import { PHASE_NAMES, RELEASE_NAMES } from "./constants";
import { computeEffectiveCapacity } from "./cost";
import { buildNarrativeContext, decomposeCapability } from "./decompose";
import { orderByDependencyAndPriority } from "./dependencyGraph";
import { METHODOLOGY_PROFILES, resolveMethodology, type MethodologyProfile } from "./methodology";
import type {
  CapabilityInput,
  GeneratedPlan,
  IntakeInput,
  Methodology,
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

/**
 * Agile/Scrum roadmap mode: one continuous, priority-ordered backlog instead
 * of an MVP/value gate — "Now" is just the top of the backlog. Reuses
 * `orderByDependencyAndPriority`'s single topological+priority sort over the
 * WHOLE capability set (not per-phase), so chunking the already-sorted array
 * preserves "dependency before dependent" without partitionPhases's
 * forward-dependency promotion loop.
 */
export function partitionPhasesContinuousBacklog(
  capabilities: CapabilityInput[],
  windowSize = 3,
): Map<number, CapabilityInput[]> {
  const ordered = orderByDependencyAndPriority(capabilities);
  const phases = new Map<number, CapabilityInput[]>();
  for (let i = 0; i < ordered.length; i += windowSize) {
    phases.set(Math.floor(i / windowSize) + 1, ordered.slice(i, i + windowSize));
  }
  return phases;
}

function agileWindowName(phaseNumber: number): string {
  if (phaseNumber === 1) return "Now";
  if (phaseNumber === 2) return "Next";
  return `Later ${phaseNumber - 2}`;
}

function phaseName(profile: MethodologyProfile, phaseNumber: number): string {
  return profile.roadmapMode === "continuous_backlog"
    ? agileWindowName(phaseNumber)
    : (PHASE_NAMES[phaseNumber] ?? `Phase ${phaseNumber}`);
}

function releaseName(profile: MethodologyProfile, phaseNumber: number, index: number): string {
  return profile.roadmapMode === "continuous_backlog"
    ? `Release ${index + 1} (${agileWindowName(phaseNumber)})`
    : (RELEASE_NAMES[phaseNumber] ?? `Release ${index + 1}`);
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

export interface ContinuousFlowResult {
  phaseDateRanges: Map<number, { startDate: Date; endDate: Date }>;
  releaseDateByPhase: Map<number, Date>;
  throughputPerWeek: number;
}

/**
 * Kanban's sprint mode: no discrete sprints at all. Walks the same
 * phase-ordered, priority-sorted story list `packSprints` would, but instead
 * of binning into fixed-length sprints, accumulates points and derives a
 * forecasted date from a throughput rate (capacityPoints ÷ sprintLengthWeeks
 * — the same capacity number, expressed as points/week instead of
 * points/sprint). Every story's `sprintNumber` stays 0 (never assigned).
 */
export function packContinuousFlow(args: {
  stories: PackableStory[];
  capacityPoints: number;
  sprintLengthWeeks: number;
  startDate: Date;
}): ContinuousFlowResult {
  const { stories, capacityPoints, sprintLengthWeeks, startDate } = args;
  const throughputPerWeek = sprintLengthWeeks > 0 ? capacityPoints / sprintLengthWeeks : capacityPoints;
  const dateAt = (points: number): Date =>
    throughputPerWeek > 0
      ? new Date(startDate.getTime() + (points / throughputPerWeek) * 7 * DAY)
      : startDate;

  const phaseDateRanges = new Map<number, { startDate: Date; endDate: Date }>();
  const releaseDateByPhase = new Map<number, Date>();
  let cumulative = 0;
  let currentPhase: number | null = null;
  let phaseStartCumulative = 0;

  const closePhase = (phaseNumber: number) => {
    phaseDateRanges.set(phaseNumber, { startDate: dateAt(phaseStartCumulative), endDate: dateAt(cumulative) });
    releaseDateByPhase.set(phaseNumber, dateAt(cumulative));
  };

  for (const { story, phaseNumber } of stories) {
    if (currentPhase !== phaseNumber) {
      if (currentPhase !== null) closePhase(currentPhase);
      currentPhase = phaseNumber;
      phaseStartCumulative = cumulative;
    }
    cumulative += story.points;
  }
  if (currentPhase !== null) closePhase(currentPhase);

  return { phaseDateRanges, releaseDateByPhase, throughputPerWeek };
}

/** The full deterministic pipeline: intake answers → connected plan. */
export function buildPlan(input: IntakeInput, methodology: Methodology = "hybrid"): GeneratedPlan {
  const profile = METHODOLOGY_PROFILES[resolveMethodology(methodology)];
  const capacityPoints = computeEffectiveCapacity(input);
  const ctx = buildNarrativeContext(input);
  const phasePartition =
    profile.roadmapMode === "continuous_backlog"
      ? partitionPhasesContinuousBacklog(input.capabilities)
      : partitionPhases(input.capabilities);

  // Decompose every capability under its phase, in phase order.
  const phases: PlannedPhase[] = [...phasePartition.entries()].map(
    ([phaseNumber, caps]) => ({
      phaseNumber,
      name: phaseName(profile, phaseNumber),
      startDate: input.startDate, // refined below (from sprint spans or throughput math)
      endDate: input.startDate,
      capabilityIds: caps.map((c) => c.id),
      features: caps.map((c) => decomposeCapability(c, ctx)),
    }),
  );

  // Flatten stories in strict roadmap order.
  const packable: PackableStory[] = phases.flatMap((phase) =>
    phase.features.flatMap((f) =>
      f.epics.flatMap((e) => e.stories.map((story) => ({ story, phaseNumber: phase.phaseNumber }))),
    ),
  );

  let sprints: PlannedSprint[];
  let releases: PlannedRelease[];

  if (profile.sprintMode === "continuous_flow") {
    const flow = packContinuousFlow({
      stories: packable,
      capacityPoints,
      sprintLengthWeeks: input.sprintLengthWeeks,
      startDate: input.startDate,
    });
    for (const phase of phases) {
      const range = flow.phaseDateRanges.get(phase.phaseNumber);
      if (range) {
        phase.startDate = range.startDate;
        phase.endDate = range.endDate;
      }
    }
    sprints = []; // Kanban never bins stories into discrete sprints.
    releases = phases.map((phase, i) => ({
      order: i + 1,
      name: releaseName(profile, phase.phaseNumber, i),
      phaseNumber: phase.phaseNumber,
      targetDate: flow.releaseDateByPhase.get(phase.phaseNumber) ?? phase.endDate,
    }));
  } else {
    sprints = packSprints({
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
    releases = phases.map((phase, i) => ({
      order: i + 1,
      name: releaseName(profile, phase.phaseNumber, i),
      phaseNumber: phase.phaseNumber,
      targetDate: phase.endDate,
    }));
  }

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
