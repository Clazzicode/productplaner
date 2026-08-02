import { describe, expect, it } from "vitest";
import { partitionPhases } from "../buildPlan";
import type { CapabilityInput } from "../types";

const cap = (over: Partial<CapabilityInput> & { id: string }): CapabilityInput => ({
  name: over.id,
  description: "",
  isMvp: true,
  effortSize: "m",
  businessValue: "high",
  order: 0,
  dependsOn: [],
  ...over,
});

const phaseOfEach = (phases: Map<number, CapabilityInput[]>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [n, caps] of phases) for (const c of caps) out[c.id] = n;
  return out;
};

describe("partitionPhases — baseline (no overrides), regression", () => {
  it("splits MVP / high-value / rest exactly as before manualPhaseOverride existed", () => {
    const caps = [
      cap({ id: "mvp" }),
      cap({ id: "fast-follow", isMvp: false, businessValue: "high" }),
      cap({ id: "later", isMvp: false, businessValue: "low" }),
    ];
    const phases = phaseOfEach(partitionPhases(caps));
    expect(phases).toEqual({ mvp: 1, "fast-follow": 2, later: 3 });
  });
});

describe("partitionPhases — manualPhaseOverride", () => {
  it("seeds from the override instead of the computed MVP/value rule", () => {
    const caps = [
      // Would compute to phase 3 (non-MVP, low value) without the override.
      cap({ id: "pinned", isMvp: false, businessValue: "low", manualPhaseOverride: 1 }),
    ];
    expect(phaseOfEach(partitionPhases(caps))).toEqual({ pinned: 1 });
  });

  it("cascades: overriding a dependent to an earlier phase promotes its (unoverridden) dependency too", () => {
    const caps = [
      // "later" would compute to phase 3 on its own.
      cap({ id: "later", isMvp: false, businessValue: "low" }),
      // "pinned" is dragged to phase 1 and depends on "later".
      cap({ id: "pinned", isMvp: false, businessValue: "low", dependsOn: ["later"], manualPhaseOverride: 1 }),
    ];
    const phases = phaseOfEach(partitionPhases(caps));
    expect(phases.pinned).toBe(1);
    // The dependency invariant (never later than its dependent) still holds —
    // "later" gets promoted from its computed phase 3 up to phase 1.
    expect(phases.later).toBe(1);
  });

  it("gets corrected back when a drag would push a dependency later than its dependent (accepted tradeoff)", () => {
    const caps = [
      // "consumer" is MVP (computed phase 1) and depends on "base".
      cap({ id: "consumer", isMvp: true, dependsOn: ["base"] }),
      // "base" is dragged to phase 3 — later than its dependent "consumer".
      cap({ id: "base", isMvp: false, businessValue: "low", manualPhaseOverride: 3 }),
    ];
    const phases = phaseOfEach(partitionPhases(caps));
    expect(phases.consumer).toBe(1);
    // The override is silently corrected back to satisfy the invariant —
    // this is the documented, accepted behavior (surfaced as an API warning,
    // not hidden) rather than letting a dependency land after its dependent.
    expect(phases.base).toBe(1);
  });

  it("does not affect capabilities without an override", () => {
    const caps = [
      cap({ id: "pinned", isMvp: false, businessValue: "low", manualPhaseOverride: 2 }),
      cap({ id: "computed-mvp" }),
      cap({ id: "computed-later", isMvp: false, businessValue: "low" }),
    ];
    const phases = phaseOfEach(partitionPhases(caps));
    expect(phases).toEqual({ pinned: 2, "computed-mvp": 1, "computed-later": 3 });
  });
});
