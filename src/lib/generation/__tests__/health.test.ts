import { describe, expect, it } from "vitest";
import { costHealth, scheduleHealth, scopeHealth, type ScopeSignals } from "../health";

describe("schedule health (§26)", () => {
  it("boundary values: ≤90% on track, ≤100% attention, over at risk", () => {
    expect(scheduleHealth(90, 100)).toBe("on_track");
    expect(scheduleHealth(90.1, 100)).toBe("attention");
    expect(scheduleHealth(100, 100)).toBe("attention");
    expect(scheduleHealth(100.1, 100)).toBe("at_risk");
  });
});

describe("cost health (§27)", () => {
  it("boundary values: within budget, 1–10% over, more than 10% over", () => {
    expect(costHealth(100000, 100000)).toBe("on_track");
    expect(costHealth(100001, 100000)).toBe("attention");
    expect(costHealth(110000, 100000)).toBe("attention"); // exactly 10% over
    expect(costHealth(110001, 100000)).toBe("at_risk");
  });

  it("returns null when no budget was given", () => {
    expect(costHealth(50000, null)).toBeNull();
    expect(costHealth(50000, 0)).toBeNull();
  });
});

describe("scope health (§28)", () => {
  const stable: ScopeSignals = {
    newMvpCapabilities: 0,
    removedBaselineItems: 0,
    materialEstimateIncreases: 0,
    dependencyChanges: 0,
    releaseDateChanged: false,
    capacityDropPercent: 0,
    budgetOverrunPercent: 0,
  };

  it("is stable with no signals", () => {
    expect(scopeHealth(stable)).toBe("on_track");
  });

  it("one new MVP capability / estimate increase / dependency change → attention", () => {
    expect(scopeHealth({ ...stable, newMvpCapabilities: 1 })).toBe("attention");
    expect(scopeHealth({ ...stable, materialEstimateIncreases: 1 })).toBe("attention");
    expect(scopeHealth({ ...stable, dependencyChanges: 1 })).toBe("attention");
  });

  it("multiple MVP additions, release-date change, >20% capacity drop, >10% budget overrun → at risk", () => {
    expect(scopeHealth({ ...stable, newMvpCapabilities: 2 })).toBe("at_risk");
    expect(scopeHealth({ ...stable, releaseDateChanged: true })).toBe("at_risk");
    expect(scopeHealth({ ...stable, capacityDropPercent: 21 })).toBe("at_risk");
    expect(scopeHealth({ ...stable, budgetOverrunPercent: 10.1 })).toBe("at_risk");
    expect(scopeHealth({ ...stable, capacityDropPercent: 20 })).toBe("on_track"); // exactly 20% absorbs
  });
});
