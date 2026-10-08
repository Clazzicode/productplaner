import { db } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { requestSchema } from "@/lib/requests/model";
import { dependencyWarnings, deriveReleaseQuality, roadmapViewsForMethodology, type QualityRisk } from "./quality";
import { deriveFeatureHealth, deriveFeatureSchedule, type TimelineHealth } from "./timelineDerivation";

const parseJson = (raw: string): Record<string, unknown> => {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
};

type DefectSignal = {
  severity: "low" | "medium" | "high" | "critical";
  status: "reported" | "confirmed" | "in_progress" | "resolved" | "closed";
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
  health: TimelineHealth | null;
  epicCount: number;
  storyCount: number;
  dependsOnNames: string[];
  dependedOnByNames: string[];
  dependencyWarnings: string[];
  defectCount: number;
  blockerCount: number;
  qualityRisk: QualityRisk;
  releaseId: string | null;
  releaseName: string | null;
  releaseTargetDate: Date | null;
  sprintRange: string | null;
}

export interface TimelinePhaseGroup {
  phaseNumber: number;
  name: string;
  features: TimelineFeature[];
}

export interface TimelineRelease {
  id: string;
  label: string;
  targetDate: Date;
  cadence: string;
  featureCount: number;
  defectCount: number;
  blockerCount: number;
  qualityRisk: QualityRisk;
}

export interface RoadmapTimelineData {
  available: boolean;
  unavailableReason: string | null;
  phases: TimelinePhaseGroup[];
  unscheduled: TimelineFeature[];
  releases: TimelineRelease[];
  axisStart: Date | null;
  axisEnd: Date | null;
}

export async function loadRoadmapTimelineData(
  initiativeId: string,
  prototypeId: string,
  methodology: string,
): Promise<RoadmapTimelineData> {
  if (!roadmapViewsForMethodology(methodology).timeline) {
    return {
      available: false,
      unavailableReason: "This methodology is not supported by the timeline yet. The feature-planning roadmap remains available.",
      phases: [], unscheduled: [], releases: [], axisStart: null, axisEnd: null,
    };
  }

  const [phaseRows, sprintRows, releaseRows, capabilities, initiative, requests, blockers] = await Promise.all([
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
        id: true, name: true, isMvp: true, businessValue: true, riskLevel: true,
        backlogLane: true, releaseId: true,
        dependsOnEdges: {
          select: {
            toCapabilityId: true,
            toCapability: { select: { name: true, backlogLane: true, releaseId: true } },
          },
        },
      },
    }),
    db.initiative.findUnique({
      where: { id: initiativeId },
      select: { releaseCadence: true, customReleaseCadence: true },
    }),
    db.planningRequest.findMany({
      where: { initiativeId, archivedAt: null, capabilityId: { not: null } },
      select: { capabilityId: true, data: true },
    }),
    db.refinementFinding.findMany({
      where: { initiativeId, category: "blocker", status: "open" },
      select: { story: { select: { sourceCapabilityId: true } } },
    }),
  ]);

  const releaseById = new Map(releaseRows.map((release) => [release.id, release]));
  const capById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const defectsByCapability = new Map<string, DefectSignal[]>();
  for (const row of requests) {
    if (!row.capabilityId) continue;
    const parsed = requestSchema.safeParse(row.data);
    if (!parsed.success || !["bug", "defect"].includes(parsed.data.kind)) continue;
    const list = defectsByCapability.get(row.capabilityId) ?? [];
    list.push({ severity: parsed.data.bug.severity, status: parsed.data.bug.status });
    defectsByCapability.set(row.capabilityId, list);
  }
  const blockersByCapability = new Map<string, number>();
  for (const finding of blockers) {
    const capabilityId = finding.story.sourceCapabilityId;
    if (capabilityId) blockersByCapability.set(capabilityId, (blockersByCapability.get(capabilityId) ?? 0) + 1);
  }

  const dependedOnByNames = new Map<string, string[]>();
  for (const capability of capabilities) {
    for (const edge of capability.dependsOnEdges) {
      const list = dependedOnByNames.get(edge.toCapabilityId) ?? [];
      list.push(capability.name);
      dependedOnByNames.set(edge.toCapabilityId, list);
    }
  }

  const forecast = computeCapacityForecast(sprintRows);
  const forecastByNumber = new Map(forecast.map((item) => [item.sprintNumber, item]));
  const sprintByNumber = new Map(sprintRows.map((sprint) => [sprint.sprintNumber, sprint]));
  const sprintById = new Map(sprintRows.map((sprint) => [sprint.id, sprint]));
  const releaseByPhase = new Map(releaseRows.map((release) => [release.phaseNumber, release]));
  const releaseMetrics = new Map(releaseRows.map((release) => [release.id, {
    featureCount: 0,
    defects: [] as DefectSignal[],
    blockerCount: 0,
    featureRisks: [] as string[],
  }]));
  const today = new Date();

  const phases: TimelinePhaseGroup[] = [];
  const unscheduled: TimelineFeature[] = [];
  let axisStart: Date | null = null;
  let axisEnd: Date | null = null;

  for (const release of releaseRows) {
    if (!axisStart || release.targetDate < axisStart) axisStart = release.targetDate;
    if (!axisEnd || release.targetDate > axisEnd) axisEnd = release.targetDate;
  }

  for (const phaseRow of phaseRows) {
    const content = parseJson(phaseRow.contentJson);
    const phaseNumber = (content.phaseNumber as number | undefined) ?? phaseRow.order + 1;
    const phaseRange = content.startDate && content.endDate
      ? { start: new Date(content.startDate as string), end: new Date(content.endDate as string) }
      : null;
    const features: TimelineFeature[] = [];

    for (const featureRow of phaseRow.children) {
      const cap = featureRow.sourceCapabilityId ? capById.get(featureRow.sourceCapabilityId) : undefined;
      const stories = featureRow.children.flatMap((epic) => epic.children);
      const featurePoints = stories.reduce((total, story) => total + (story.points ?? 1), 0);
      const sprintNumbers = [...new Set(
        stories
          .map((story) => (story.sprintId ? sprintById.get(story.sprintId)?.sprintNumber : undefined))
          .filter((number): number is number => number != null),
      )].sort((left, right) => left - right);
      const spannedSprints = sprintNumbers.map((number) => sprintByNumber.get(number)!).filter(Boolean);
      const schedule = deriveFeatureSchedule({ spannedSprints, phaseRange });
      const spannedCapacity = spannedSprints.reduce((total, sprint) => total + sprint.capacityPoints, 0);
      const health = schedule.source === "unscheduled" ? null : deriveFeatureHealth({
        anyOverAllocated: sprintNumbers.some((number) => forecastByNumber.get(number)?.status === "over-allocated"),
        featurePoints, spannedCapacity, end: schedule.end, today,
      });

      const assignedRelease = (cap?.releaseId ? releaseById.get(cap.releaseId) : undefined) ?? releaseByPhase.get(phaseNumber);
      const defects = cap ? defectsByCapability.get(cap.id) ?? [] : [];
      const blockerCount = cap ? blockersByCapability.get(cap.id) ?? 0 : 0;
      const quality = deriveReleaseQuality({
        defects, blockerCount, featureRisks: cap?.riskLevel ? [cap.riskLevel] : [],
      });
      const warnings = cap ? dependencyWarnings({
        featureLane: cap.backlogLane,
        releaseTargetDate: assignedRelease?.targetDate ?? null,
        dependencies: cap.dependsOnEdges.map((edge) => ({
          name: edge.toCapability.name,
          lane: edge.toCapability.backlogLane,
          releaseTargetDate: edge.toCapability.releaseId
            ? releaseById.get(edge.toCapability.releaseId)?.targetDate ?? null
            : null,
        })),
      }) : [];

      if (assignedRelease) {
        const metrics = releaseMetrics.get(assignedRelease.id)!;
        metrics.featureCount += 1;
        metrics.defects.push(...defects);
        metrics.blockerCount += blockerCount;
        if (cap?.riskLevel) metrics.featureRisks.push(cap.riskLevel);
      }

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
        dependsOnNames: cap?.dependsOnEdges.map((edge) => edge.toCapability.name) ?? [],
        dependedOnByNames: cap ? (dependedOnByNames.get(cap.id) ?? []) : [],
        dependencyWarnings: warnings,
        defectCount: quality.defectCount,
        blockerCount: quality.blockerCount,
        qualityRisk: quality.qualityRisk,
        releaseId: assignedRelease?.id ?? null,
        releaseName: assignedRelease?.name ?? null,
        releaseTargetDate: assignedRelease?.targetDate ?? null,
        sprintRange: sprintNumbers.length === 0
          ? null
          : sprintNumbers.length === 1
            ? `Sprint ${sprintNumbers[0]}`
            : `Sprint ${sprintNumbers[0]}–${sprintNumbers[sprintNumbers.length - 1]}`,
      };

      if (schedule.source === "unscheduled") unscheduled.push(feature);
      else {
        features.push(feature);
        if (schedule.start && (!axisStart || schedule.start < axisStart)) axisStart = schedule.start;
        if (schedule.end && (!axisEnd || schedule.end > axisEnd)) axisEnd = schedule.end;
      }
    }
    phases.push({ phaseNumber, name: phaseRow.title, features });
  }

  const cadence = initiative?.releaseCadence === "custom"
    ? initiative.customReleaseCadence || "Custom cadence"
    : initiative?.releaseCadence ?? "";

  return {
    available: true,
    unavailableReason: null,
    phases,
    unscheduled,
    releases: releaseRows.map((release) => {
      const metrics = releaseMetrics.get(release.id)!;
      return {
        id: release.id,
        label: release.name,
        targetDate: release.targetDate,
        cadence,
        featureCount: metrics.featureCount,
        ...deriveReleaseQuality(metrics),
      };
    }),
    axisStart,
    axisEnd,
  };
}

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
  releases: (Omit<TimelineRelease, "targetDate"> & { targetDate: string })[];
  axisStart: string | null;
  axisEnd: string | null;
}

const serializeFeature = (feature: TimelineFeature): ClientTimelineFeature => ({
  ...feature,
  start: feature.start?.toISOString() ?? null,
  end: feature.end?.toISOString() ?? null,
  releaseTargetDate: feature.releaseTargetDate?.toISOString() ?? null,
});

export function serializeTimelineData(data: RoadmapTimelineData): ClientRoadmapTimelineData {
  return {
    available: data.available,
    unavailableReason: data.unavailableReason,
    phases: data.phases.map((phase) => ({ ...phase, features: phase.features.map(serializeFeature) })),
    unscheduled: data.unscheduled.map(serializeFeature),
    releases: data.releases.map((release) => ({ ...release, targetDate: release.targetDate.toISOString() })),
    axisStart: data.axisStart?.toISOString() ?? null,
    axisEnd: data.axisEnd?.toISOString() ?? null,
  };
}
