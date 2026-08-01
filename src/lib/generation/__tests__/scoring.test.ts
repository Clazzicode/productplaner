import { describe, expect, it } from "vitest";
import { orderByDependencyAndPriority } from "../dependencyGraph";
import {
  businessValueLevelFromScore,
  computeBusinessValueScore,
  computePriorityScore,
  dependencyImportanceScore,
  deriveMvpImportance,
  riskReductionScore,
  snapToFibonacci,
  valueFactorsFrom,
} from "../scoring";
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

describe("business value scoring (§2)", () => {
  it("matches the worked example: (5×.30)+(4×.30)+(4×.25)+(2×.15) = 4.0 → High", () => {
    const score = computeBusinessValueScore({
      customerImpactScore: 5,
      revenueImpactScore: 4,
      strategicAlignmentScore: 4,
      riskComplianceScore: 2,
    });
    expect(score).toBe(4.0);
    expect(businessValueLevelFromScore(score)).toBe("high");
  });

  it("maps score boundaries onto the five levels", () => {
    expect(businessValueLevelFromScore(5)).toBe("critical");
    expect(businessValueLevelFromScore(4.5)).toBe("critical");
    expect(businessValueLevelFromScore(3.5)).toBe("high");
    expect(businessValueLevelFromScore(2.5)).toBe("medium");
    expect(businessValueLevelFromScore(1.5)).toBe("low");
    expect(businessValueLevelFromScore(1)).toBe("very_low");
  });

  it("ignores partial factor sets", () => {
    expect(valueFactorsFrom({ customerImpactScore: 5 })).toBeNull();
    expect(
      valueFactorsFrom({
        customerImpactScore: 5,
        revenueImpactScore: 4,
        strategicAlignmentScore: 4,
        riskComplianceScore: 2,
      }),
    ).not.toBeNull();
  });
});

describe("priority sub-factors (§5)", () => {
  it("derives MVP importance from Q4 when unset, honors overrides", () => {
    expect(deriveMvpImportance({ isMvp: true })).toBe("required_for_mvp");
    expect(deriveMvpImportance({ isMvp: false })).toBe("useful_not_required");
    expect(deriveMvpImportance({ isMvp: true, mvpImportance: "optional" })).toBe("optional");
  });

  it("buckets dependency importance from dependents count", () => {
    expect(dependencyImportanceScore(0)).toBe(1);
    expect(dependencyImportanceScore(1)).toBe(2);
    expect(dependencyImportanceScore(3)).toBe(4);
    expect(dependencyImportanceScore(4)).toBe(5);
    expect(dependencyImportanceScore(10)).toBe(5);
  });

  it("scores risk reduction highest for high-risk MVP work (§4 rule)", () => {
    expect(riskReductionScore("critical", true)).toBe(5);
    expect(riskReductionScore("critical", false)).toBe(4);
    expect(riskReductionScore("high", true)).toBe(4);
    expect(riskReductionScore("high", false)).toBe(3);
    expect(riskReductionScore("medium", true)).toBe(2);
    expect(riskReductionScore("low", false)).toBe(1);
  });

  it("computes the weighted priority score", () => {
    // high value (4) ×.45 + required MVP (5) ×.25 + independent (1) ×.15 + medium risk (2) ×.15
    const score = computePriorityScore(cap({ id: "a", riskLevel: "medium" }), 0);
    expect(score).toBeCloseTo(4 * 0.45 + 5 * 0.25 + 1 * 0.15 + 2 * 0.15, 2); // 3.5
  });
});

describe("story point snapping (§9)", () => {
  it("snaps to the Fibonacci scale, ties rounding down", () => {
    expect(snapToFibonacci(1)).toBe(1);
    expect(snapToFibonacci(4)).toBe(3); // tie between 3 and 5 → down
    expect(snapToFibonacci(6)).toBe(5);
    expect(snapToFibonacci(7)).toBe(8);
    expect(snapToFibonacci(12)).toBe(13);
    expect(snapToFibonacci(40)).toBe(13);
  });
});

describe("ordering comparator backward compatibility", () => {
  it("orders legacy inputs (no riskLevel/mvpImportance) exactly as before", () => {
    const caps = [
      cap({ id: "low-value-dep", businessValue: "low", order: 0 }),
      cap({ id: "big-critical", businessValue: "critical", effortSize: "xl", order: 1, dependsOn: ["low-value-dep"] }),
      cap({ id: "small-critical", businessValue: "critical", effortSize: "s", order: 2 }),
      cap({ id: "medium-a", businessValue: "medium", effortSize: "m", order: 3 }),
      cap({ id: "medium-b", businessValue: "medium", effortSize: "m", order: 4 }),
    ];
    // Legacy rules among available nodes: value desc → effort asc → input
    // order. big-critical stays blocked until its low-value dep is emitted,
    // so both mediums outrank the dep while it's the lowest-value available.
    expect(orderByDependencyAndPriority(caps).map((c) => c.id)).toEqual([
      "small-critical",
      "medium-a",
      "medium-b",
      "low-value-dep",
      "big-critical",
    ]);
  });

  it("prioritizes high-risk MVP work when risk levels are provided (§4/§6)", () => {
    const caps = [
      cap({ id: "safe", riskLevel: "low", order: 0 }),
      cap({ id: "risky", riskLevel: "critical", order: 1 }),
    ];
    // Same value/effort/MVP — the §5 risk-reduction term breaks the tie.
    expect(orderByDependencyAndPriority(caps).map((c) => c.id)).toEqual(["risky", "safe"]);
  });

  it("still never schedules a dependent before its dependency", () => {
    const caps = [
      cap({ id: "a", riskLevel: "critical", dependsOn: ["b"], order: 0 }),
      cap({ id: "b", riskLevel: "low", order: 1 }),
    ];
    const ordered = orderByDependencyAndPriority(caps).map((c) => c.id);
    expect(ordered.indexOf("b")).toBeLessThan(ordered.indexOf("a"));
  });
});
