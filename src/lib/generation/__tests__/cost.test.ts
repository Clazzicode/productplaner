import { describe, expect, it } from "vitest";
import {
  buildCostModel,
  computeAvailableTeamHours,
  computeBudgetVariance,
  computeCapabilityCost,
  computeCostPerStoryPoint,
  computeEffectiveCapacity,
  computeInitiativeCost,
  computeReleaseCostAllocated,
  computeSprintLaborCost,
  computeStoryCost,
  computeUsableTeamHours,
  roundCurrency,
} from "../cost";

// Every fixture below is a literal worked example from "Planning & Cost Logic".

const hoursCapacity = {
  teamSize: 5,
  velocityPerPersonPerSprint: 8,
  capacityBufferPercent: 15,
  hoursPerSprintPerMember: 80,
  utilizationRatePercent: 70,
  hoursPerStoryPoint: 8,
};

describe("hours-based capacity (§10–§12)", () => {
  it("§10: 5 members × 80 hrs × 70% utilization = 280 available hours", () => {
    expect(
      computeAvailableTeamHours({ teamSize: 5, hoursPerSprintPerMember: 80, utilizationRatePercent: 70 }),
    ).toBe(280);
  });

  it("§11: 280 hours × 85% = 238 usable hours", () => {
    expect(computeUsableTeamHours(280, 15)).toBe(238);
  });

  it("§12: 238 ÷ 8 = 29.75 → rounds down → 29 points", () => {
    expect(computeEffectiveCapacity(hoursCapacity)).toBe(29);
  });

  it("falls back to the legacy points formula when hours inputs are absent", () => {
    expect(
      computeEffectiveCapacity({
        teamSize: 5,
        velocityPerPersonPerSprint: 8,
        capacityBufferPercent: 20,
      }),
    ).toBeCloseTo(32);
  });

  it("§13: historical velocity caps the estimate (conservative rule)", () => {
    expect(computeEffectiveCapacity({ ...hoursCapacity, historicalVelocityPoints: 26 })).toBe(26);
    expect(computeEffectiveCapacity({ ...hoursCapacity, historicalVelocityPoints: 40 })).toBe(29);
  });
});

describe("cost chain (§17–§25)", () => {
  it("§17: 280 hours × $85 = $23,800 per sprint", () => {
    expect(computeSprintLaborCost(280, 85)).toBe(23800);
  });

  it("§18: $23,800 ÷ 29 points ≈ $820.69 → displayed $821", () => {
    const raw = computeCostPerStoryPoint(23800, 29);
    expect(raw).toBeCloseTo(820.69, 2);
    expect(roundCurrency(raw)).toBe(821);
  });

  it("§19: 5 points × $821 = $4,105", () => {
    expect(computeStoryCost(5, 821)).toBe(4105);
  });

  it("§20: story costs sum to the epic cost — $4,105 + $2,463 + $6,568 = $13,136", () => {
    expect(computeStoryCost(5, 821) + computeStoryCost(3, 821) + computeStoryCost(8, 821)).toBe(13136);
  });

  it("§22: allocated release cost = sprints × sprint labor cost", () => {
    expect(computeReleaseCostAllocated(4, 23800)).toBe(95200);
  });

  it("§23: 8 sprints × $23,800 = $190,400 initiative cost", () => {
    expect(computeInitiativeCost(8, 23800)).toBe(190400);
  });

  it("§24: $190,400 vs $175,000 budget → $15,400 over (8.8%)", () => {
    expect(computeBudgetVariance(190400, 175000)).toEqual({ amount: 15400, percent: 8.8 });
  });

  it("§25: capability cost = total capability points × cost per point", () => {
    expect(computeCapabilityCost(16, 821)).toBe(13136);
  });
});

describe("assembled cost model", () => {
  it("composes the full chain from capacity inputs and live plan counts", () => {
    const model = buildCostModel({
      capacity: hoursCapacity,
      averageHourlyRate: 85,
      budget: 175000,
      totalSprints: 8,
      totalPlannedPoints: 184,
    });
    expect(model.usingHoursModel).toBe(true);
    expect(model.availableTeamHours).toBe(280);
    expect(model.usableTeamHours).toBe(238);
    expect(model.sprintPointCapacity).toBe(29);
    expect(model.sprintLaborCost).toBe(23800);
    expect(model.costPerStoryPoint).toBe(821);
    expect(model.estimatedInitiativeCost).toBe(190400);
    expect(model.plannedWorkCost).toBe(184 * 821);
    expect(model.unusedCapacityCost).toBe(190400 - 184 * 821);
    expect(model.budgetVariance).toEqual({ amount: 15400, percent: 8.8 });
  });

  it("uses the §31 default rate when none is given and reports no variance without a budget", () => {
    const model = buildCostModel({
      capacity: hoursCapacity,
      totalSprints: 2,
      totalPlannedPoints: 40,
    });
    expect(model.averageHourlyRate).toBe(85);
    expect(model.budget).toBeNull();
    expect(model.budgetVariance).toBeNull();
  });
});
