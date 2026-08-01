// Capacity and cost calculations from "Planning & Cost Logic" (§10–§25).
// Pure functions, computed on read — never persisted (same discipline as
// capacityForecast.ts), so cost figures can't go stale and never touch
// locked waterfall layers.

import { DEFAULT_ASSUMPTIONS } from "./constants";

export interface CapacityInputs {
  teamSize: number;
  // legacy points model (Q7 v1)
  velocityPerPersonPerSprint: number;
  capacityBufferPercent: number;
  // §10–12 hours model — supersedes the points model when all present
  hoursPerSprintPerMember?: number;
  utilizationRatePercent?: number;
  hoursPerStoryPoint?: number;
  // §13 — when known, the estimate is capped by history (conservative rule)
  historicalVelocityPoints?: number | null;
}

/** §10: Available Team Hours = members × hours/sprint × utilization. */
export function computeAvailableTeamHours(input: {
  teamSize: number;
  hoursPerSprintPerMember: number;
  utilizationRatePercent: number;
}): number {
  return (
    input.teamSize * input.hoursPerSprintPerMember * (input.utilizationRatePercent / 100)
  );
}

/** §11: Usable Capacity = Available Team Hours × (1 − buffer). */
export function computeUsableTeamHours(availableTeamHours: number, bufferPercent: number): number {
  return availableTeamHours * (1 - bufferPercent / 100);
}

function hasHoursModel(input: CapacityInputs): boolean {
  return (
    (input.hoursPerSprintPerMember ?? 0) > 0 &&
    (input.utilizationRatePercent ?? 0) > 0 &&
    (input.hoursPerStoryPoint ?? 0) > 0
  );
}

/**
 * The one sprint-capacity number the whole platform shows (§12, floored).
 * Hours model when its inputs are present; otherwise the legacy points
 * formula (same math as computeCapacityPoints — inlined to keep this module
 * import-cycle-free, since validateIntake imports from here).
 * §13: when historical velocity is known, the estimate is capped by it.
 */
export function computeEffectiveCapacity(input: CapacityInputs): number {
  let capacity: number;
  if (hasHoursModel(input)) {
    const available = computeAvailableTeamHours({
      teamSize: input.teamSize,
      hoursPerSprintPerMember: input.hoursPerSprintPerMember!,
      utilizationRatePercent: input.utilizationRatePercent!,
    });
    const usable = computeUsableTeamHours(available, input.capacityBufferPercent);
    capacity = Math.max(1, Math.floor(usable / input.hoursPerStoryPoint!));
  } else {
    capacity =
      input.teamSize *
      input.velocityPerPersonPerSprint *
      (1 - input.capacityBufferPercent / 100);
  }
  const historical = input.historicalVelocityPoints ?? 0;
  return historical > 0 ? Math.min(capacity, historical) : capacity;
}

// ---------- §17–§25 cost chain ----------

/** §17: Sprint Labor Cost = Available Team Hours × Average Hourly Rate. */
export function computeSprintLaborCost(availableTeamHours: number, averageHourlyRate: number): number {
  return availableTeamHours * averageHourlyRate;
}

/** §18: Cost per Story Point = Sprint Labor Cost ÷ Sprint Point Capacity. */
export function computeCostPerStoryPoint(sprintLaborCost: number, sprintPointCapacity: number): number {
  return sprintPointCapacity > 0 ? sprintLaborCost / sprintPointCapacity : 0;
}

export const roundCurrency = (n: number): number => Math.round(n);

/** §19: Story Cost = points × cost per point (callers pass the rounded rate). */
export function computeStoryCost(points: number, costPerStoryPoint: number): number {
  return points * costPerStoryPoint;
}

/** §22: allocated release cost (whole sprints) vs planned story cost. */
export function computeReleaseCostAllocated(sprintCount: number, sprintLaborCost: number): number {
  return sprintCount * sprintLaborCost;
}

/** §23: Initiative Cost = total planned sprints × sprint labor cost. */
export function computeInitiativeCost(totalSprints: number, sprintLaborCost: number): number {
  return totalSprints * sprintLaborCost;
}

/** §24: variance vs available budget (positive = over budget). */
export function computeBudgetVariance(
  estimatedCost: number,
  availableBudget: number,
): { amount: number; percent: number } {
  const amount = estimatedCost - availableBudget;
  const percent = availableBudget > 0 ? (amount / availableBudget) * 100 : 0;
  return { amount, percent: Math.round(percent * 10) / 10 };
}

/** §25: Capability Cost = total capability story points × cost per point. */
export function computeCapabilityCost(totalCapabilityPoints: number, costPerStoryPoint: number): number {
  return totalCapabilityPoints * costPerStoryPoint;
}

// ---------- assembled cost model (one object pages can render) ----------

export interface CostModel {
  usingHoursModel: boolean;
  availableTeamHours: number;
  usableTeamHours: number;
  sprintPointCapacity: number;
  averageHourlyRate: number;
  sprintLaborCost: number;
  costPerStoryPoint: number; // rounded to whole currency for display + rollups
  costPerStoryPointRaw: number;
  totalSprints: number;
  totalPlannedPoints: number;
  plannedWorkCost: number; // Σ story costs (§17 "planned work cost")
  estimatedInitiativeCost: number; // §23 allocated cost
  unusedCapacityCost: number; // §17 "unused capacity cost"
  budget: number | null;
  budgetVariance: { amount: number; percent: number } | null;
}

/**
 * Assemble the full §17–§24 chain from intake-level inputs and the live
 * sprint/story counts. `averageHourlyRate` defaults to the §31 assumption.
 */
export function buildCostModel(args: {
  capacity: CapacityInputs;
  averageHourlyRate?: number | null;
  budget?: number | null;
  totalSprints: number;
  totalPlannedPoints: number;
}): CostModel {
  const { capacity } = args;
  const usingHoursModel = hasHoursModel(capacity);
  const rate = args.averageHourlyRate ?? DEFAULT_ASSUMPTIONS.averageHourlyRate;

  const availableTeamHours = usingHoursModel
    ? computeAvailableTeamHours({
        teamSize: capacity.teamSize,
        hoursPerSprintPerMember: capacity.hoursPerSprintPerMember!,
        utilizationRatePercent: capacity.utilizationRatePercent!,
      })
    : // Legacy fallback: express point capacity back into hours via the §31
      // hours-per-point assumption so cost still computes.
      computeEffectiveCapacity(capacity) * DEFAULT_ASSUMPTIONS.hoursPerStoryPoint;
  const usableTeamHours = computeUsableTeamHours(availableTeamHours, capacity.capacityBufferPercent);
  const sprintPointCapacity = computeEffectiveCapacity(capacity);
  const sprintLaborCost = computeSprintLaborCost(availableTeamHours, rate);
  const costPerStoryPointRaw = computeCostPerStoryPoint(sprintLaborCost, sprintPointCapacity);
  const costPerStoryPoint = roundCurrency(costPerStoryPointRaw);

  const plannedWorkCost = args.totalPlannedPoints * costPerStoryPoint;
  const estimatedInitiativeCost = computeInitiativeCost(args.totalSprints, sprintLaborCost);
  const budget = args.budget ?? null;

  return {
    usingHoursModel,
    availableTeamHours,
    usableTeamHours,
    sprintPointCapacity,
    averageHourlyRate: rate,
    sprintLaborCost,
    costPerStoryPoint,
    costPerStoryPointRaw,
    totalSprints: args.totalSprints,
    totalPlannedPoints: args.totalPlannedPoints,
    plannedWorkCost,
    estimatedInitiativeCost,
    unusedCapacityCost: Math.max(0, estimatedInitiativeCost - plannedWorkCost),
    budget,
    budgetVariance: budget != null && budget > 0 ? computeBudgetVariance(estimatedInitiativeCost, budget) : null,
  };
}
