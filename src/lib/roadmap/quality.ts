export type QualityRisk = "low" | "medium" | "high" | "critical";

export interface DefectSignal {
  severity: "low" | "medium" | "high" | "critical";
  status: "reported" | "confirmed" | "in_progress" | "resolved" | "closed";
}

export interface ReleaseQuality {
  defectCount: number;
  blockerCount: number;
  qualityRisk: QualityRisk;
}

export function deriveReleaseQuality(input: {
  defects: DefectSignal[];
  blockerCount: number;
  featureRisks?: string[];
}): ReleaseQuality {
  const active = input.defects.filter((defect) => !["resolved", "closed"].includes(defect.status));
  const severities = new Set(active.map((defect) => defect.severity));
  const featureRisks = new Set(input.featureRisks ?? []);

  let qualityRisk: QualityRisk = "low";
  if (severities.has("critical") || input.blockerCount >= 2) qualityRisk = "critical";
  else if (severities.has("high") || input.blockerCount > 0 || featureRisks.has("critical")) qualityRisk = "high";
  else if (active.length > 0 || featureRisks.has("high")) qualityRisk = "medium";

  return { defectCount: active.length, blockerCount: input.blockerCount, qualityRisk };
}

const laneRank: Record<string, number> = { now: 0, next: 1, later: 2, unscheduled: 3 };

export function dependencyWarnings(input: {
  featureLane: string;
  releaseTargetDate: Date | null;
  dependencies: { name: string; lane: string; releaseTargetDate: Date | null }[];
}): string[] {
  const warnings: string[] = [];
  for (const dependency of input.dependencies) {
    if ((laneRank[dependency.lane] ?? 3) > (laneRank[input.featureLane] ?? 3)) {
      warnings.push(`${dependency.name} is planned after this feature.`);
    }
    if (input.releaseTargetDate && !dependency.releaseTargetDate) {
      warnings.push(`${dependency.name} has no target release.`);
    } else if (
      input.releaseTargetDate &&
      dependency.releaseTargetDate &&
      dependency.releaseTargetDate.getTime() > input.releaseTargetDate.getTime()
    ) {
      warnings.push(`${dependency.name} targets a later release.`);
    }
  }
  return [...new Set(warnings)];
}

export const supportedRoadmapMethodologies = ["waterfall", "agile_scrum", "hybrid", "kanban"] as const;

export function roadmapViewsForMethodology(methodology: string) {
  return {
    planning: true,
    timeline: supportedRoadmapMethodologies.includes(methodology as (typeof supportedRoadmapMethodologies)[number]),
  };
}
