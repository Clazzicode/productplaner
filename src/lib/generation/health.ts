// Schedule / cost / scope health rules from "Planning & Cost Logic" (§26–§28).
// Pure threshold functions consumed by the dashboard — computed on read.

export type HealthStatus = "on_track" | "attention" | "at_risk";

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  on_track: "On track",
  attention: "Attention needed",
  at_risk: "At risk",
};

/** §26: planned ≤90% of capacity → on track; ≤100% → attention; over → at risk. */
export function scheduleHealth(plannedPoints: number, capacityPoints: number): HealthStatus {
  if (capacityPoints <= 0) return "attention";
  const ratio = plannedPoints / capacityPoints;
  if (ratio <= 0.9) return "on_track";
  if (ratio <= 1) return "attention";
  return "at_risk";
}

/** §27: within budget → on track; 1–10% over → attention; >10% over → at risk. */
export function costHealth(estimatedCost: number, budget: number | null): HealthStatus | null {
  if (budget == null || budget <= 0) return null; // no budget given — nothing to compare
  if (estimatedCost <= budget) return "on_track";
  return estimatedCost <= budget * 1.1 ? "attention" : "at_risk";
}

export interface ScopeSignals {
  newMvpCapabilities: number; // MVP capabilities added since baseline
  removedBaselineItems: number;
  materialEstimateIncreases: number;
  dependencyChanges: number;
  releaseDateChanged: boolean;
  capacityDropPercent: number; // positive = capacity decreased
  budgetOverrunPercent: number; // positive = over budget
}

/** §28 conditions, checked worst-first. */
export function scopeHealth(s: ScopeSignals): HealthStatus {
  if (
    s.newMvpCapabilities > 1 ||
    s.releaseDateChanged ||
    s.capacityDropPercent > 20 ||
    s.budgetOverrunPercent > 10
  ) {
    return "at_risk";
  }
  if (
    s.newMvpCapabilities === 1 ||
    s.materialEstimateIncreases >= 1 ||
    s.dependencyChanges >= 1 ||
    s.removedBaselineItems >= 1
  ) {
    return "attention";
  }
  return "on_track";
}
