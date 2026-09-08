// Timeline data boundary (Step 9B, docs/V2-ROADMAP-TIMELINE.md §3/§4). All
// derivation happens here, once, server-side — components receive an already
// normalized, already-serialized shape and do no Prisma/derivation work of
// their own (per the phase's "Data Service" instruction).
//
// Zero schema changes: every field is either read directly or aggregated at
// request time from existing rows. Nothing derived here is ever persisted.

import { db } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { profileFor } from "@/lib/generation/methodology";
import { deriveFeatureHealth, deriveFeatureSchedule, type TimelineHealth } from "./timelineDerivation";

const parseJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export interface TimelineFeature {
  id: string;
  capabilityId: string | null;
  title: string;
  description: string;
  phaseNumber: number;
  phaseName: string;
  isMvp: boolean;
  businessValue: string;
  riskLevel: string | null;
  start: Date | null;
  end: Date | null;
  scheduleSource: "sprints" | "phase_range" | "unscheduled";
  health: TimelineHealth | null; // null only when unscheduled — never fabricated
  epicCount: number;
  storyCount: number;
  dependsOnNames: string[];
  dependedOnByNames: string[];
  releaseName: string | null;
  releaseTargetDate: Date | null;
  sprintRange: string | null; // e.g. "Sprint 2–4", for the detail panel only
}

export interface TimelinePhaseGroup {
  phaseNumber: number;
  name: string;
  features: TimelineFeature[];
}

export interface RoadmapTimelineData {
  available: boolean;
  unavailableReason: string | null;
  phases: TimelinePhaseGroup[];
  unscheduled: TimelineFeature[];
  axisStart: Date | null;
  axisEnd: Date | null;
}

const UNAVAILABLE_AGILE: RoadmapTimelineData = {
  available: false,
  unavailableReason:
    "Timeline isn't available for Agile/Scrum — its phases are a continuously re-ranked backlog, not fixed categories a Feature can be scheduled against.",
  phases: [],
  unscheduled: [],
  axisStart: null,
  axisEnd: null,
};

export async function loadRoadmapTimelineData(
  initiativeId: string,
  prototypeId: string,
  methodology: string,
): Promise<RoadmapTimelineData> {
  const profile = profileFor(methodology);
  if (profile.roadmapMode === "continuous_backlog") return UNAVAILABLE_AGILE;

  const [phaseRows, sprintRows, releaseRows, capabilities] = await Promise.all([
    db.artifactLayer.findMany({
      where: { prototypeId, type: "roadmap_phase" },
      orderBy: { order: "asc" },
      include: {
        children: {
          where: { type: "feature" },
          orderBy: { order: "asc" },
          include: {
            children: {
              where: { type: "epic" },
              orderBy: { order: "asc" },
              include: {
                children: {
                  where: { type: "story" },
                  select: { id: true, points: true, sprintId: true },
                },
              },
            },
          },
        },
      },
    }),
    db.sprint.findMany({
      where: { prototypeId },
      orderBy: { sprintNumber: "asc" },
      include: { stories: { select: { points: true } } },
    }),
    db.release.findMany({ where: { prototypeId }, orderBy: { order: "asc" } }),
    db.capability.findMany({
      where: { intakeAnswerSet: { initiativeId } },
      select: {
        id: true,
        name: true,
        isMvp: true,
        businessValue: true,
        riskLevel: true,
        dependsOnEdges: { select: { toCapabilityId: true, toCapability: { select: { name: true } } } },
      },
    }),
  ]);

  const capById = new Map(capabilities.map((c) => [c.id, c]));
  const dependedOnByNames = new Map<string, string[]>();
  for (const c of capabilities) {
    for (const edge of c.dependsOnEdges) {
      const list = dependedOnByNames.get(edge.toCapabilityId) ?? [];
      list.push(c.name);
      dependedOnByNames.set(edge.toCapabilityId, list);
    }
  }

  const forecast = computeCapacityForecast(sprintRows);
  const forecastByNumber = new Map(forecast.map((f) => [f.sprintNumber, f]));
  const sprintByNumber = new Map(sprintRows.map((s) => [s.sprintNumber, s]));
  const sprintById = new Map(sprintRows.map((s) => [s.id, s]));
  const releaseByPhase = new Map(releaseRows.map((r) => [r.phaseNumber, r]));
  const isContinuousFlow = profile.sprintMode === "continuous_flow";
  const today = new Date();

  const phases: TimelinePhaseGroup[] = [];
  const unscheduled: TimelineFeature[] = [];
  let axisStart: Date | null = null;
  let axisEnd: Date | null = null;

  for (const phaseRow of phaseRows) {
    const content = parseJson(phaseRow.contentJson);
    const phaseNumber = (content.phaseNumber as number | undefined) ?? phaseRow.order + 1;
    const phaseRange =
      content.startDate && content.endDate
        ? { start: new Date(content.startDate as string), end: new Date(content.endDate as string) }
        : null;

    const features: TimelineFeature[] = [];

    for (const featureRow of phaseRow.children) {
      const cap = featureRow.sourceCapabilityId ? capById.get(featureRow.sourceCapabilityId) : undefined;
      const stories = featureRow.children.flatMap((epic) => epic.children);
      const featurePoints = stories.reduce((n, s) => n + (s.points ?? 1), 0);

      const sprintNumbers = [
        ...new Set(
          stories
            .map((s) => (s.sprintId ? sprintById.get(s.sprintId)?.sprintNumber : undefined))
            .filter((n): n is number => n != null),
        ),
      ].sort((a, b) => a - b);
      const spannedSprints = sprintNumbers.map((n) => sprintByNumber.get(n)!).filter(Boolean);

      const schedule = deriveFeatureSchedule({ spannedSprints, phaseRange, isContinuousFlow });
      const spannedCapacity = spannedSprints.reduce((n, s) => n + s.capacityPoints, 0);
      const anyOverAllocated = sprintNumbers.some((n) => forecastByNumber.get(n)?.status === "over-allocated");
      const health =
        schedule.source === "unscheduled"
          ? null
          : deriveFeatureHealth({
              anyOverAllocated,
              featurePoints,
              spannedCapacity,
              end: schedule.end,
              today,
            });

      const feature: TimelineFeature = {
        id: featureRow.id,
        capabilityId: cap?.id ?? null,
        title: featureRow.title,
        description: featureRow.body,
        phaseNumber,
        phaseName: phaseRow.title,
        isMvp: cap?.isMvp ?? false,
        businessValue: cap?.businessValue ?? "medium",
        riskLevel: cap?.riskLevel ?? null,
        start: schedule.start,
        end: schedule.end,
        scheduleSource: schedule.source,
        health,
        epicCount: featureRow.children.length,
        storyCount: stories.length,
        dependsOnNames: cap?.dependsOnEdges.map((e) => e.toCapability.name) ?? [],
        dependedOnByNames: cap ? (dependedOnByNames.get(cap.id) ?? []) : [],
        releaseName: releaseByPhase.get(phaseNumber)?.name ?? null,
        releaseTargetDate: releaseByPhase.get(phaseNumber)?.targetDate ?? null,
        sprintRange:
          sprintNumbers.length === 0
            ? null
            : sprintNumbers.length === 1
              ? `Sprint ${sprintNumbers[0]}`
              : `Sprint ${sprintNumbers[0]}–${sprintNumbers[sprintNumbers.length - 1]}`,
      };

      if (schedule.source === "unscheduled") {
        unscheduled.push(feature);
      } else {
        features.push(feature);
        if (schedule.start && (!axisStart || schedule.start < axisStart)) axisStart = schedule.start;
        if (schedule.end && (!axisEnd || schedule.end > axisEnd)) axisEnd = schedule.end;
      }
    }

    phases.push({ phaseNumber, name: phaseRow.title, features });
  }

  return { available: true, unavailableReason: null, phases, unscheduled, axisStart, axisEnd };
}

// ---------- client-safe serialization (Dates -> ISO strings across the RSC boundary) ----------

export type ClientTimelineFeature = Omit<TimelineFeature, "start" | "end" | "releaseTargetDate"> & {
  start: string | null;
  end: string | null;
  releaseTargetDate: string | null;
};

export interface ClientTimelinePhaseGroup {
  phaseNumber: number;
  name: string;
  features: ClientTimelineFeature[];
}

export interface ClientRoadmapTimelineData {
  available: boolean;
  unavailableReason: string | null;
  phases: ClientTimelinePhaseGroup[];
  unscheduled: ClientTimelineFeature[];
  axisStart: string | null;
  axisEnd: string | null;
}

const serializeFeature = (f: TimelineFeature): ClientTimelineFeature => ({
  ...f,
  start: f.start ? f.start.toISOString() : null,
  end: f.end ? f.end.toISOString() : null,
  releaseTargetDate: f.releaseTargetDate ? f.releaseTargetDate.toISOString() : null,
});

export function serializeTimelineData(data: RoadmapTimelineData): ClientRoadmapTimelineData {
  return {
    available: data.available,
    unavailableReason: data.unavailableReason,
    phases: data.phases.map((p) => ({ ...p, features: p.features.map(serializeFeature) })),
    unscheduled: data.unscheduled.map(serializeFeature),
    axisStart: data.axisStart ? data.axisStart.toISOString() : null,
    axisEnd: data.axisEnd ? data.axisEnd.toISOString() : null,
  };
}
