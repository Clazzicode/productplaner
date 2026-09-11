import { describe, expect, it } from "vitest";
import { PRIORITY_WEIGHTS } from "@/lib/generation/constants";
import { computePriorityScore } from "@/lib/generation/scoring";
import type { CapabilityInput } from "@/lib/generation/types";
import { explainPriorityScore } from "../priorityScore";

function cap(overrides: Partial<CapabilityInput> = {}): CapabilityInput {
  return {
    id: "c1",
    name: "Feature",
    description: "",
    isMvp: true,
    effortSize: "m",
    businessValue: "high",
    order: 0,
    dependsOn: [],
    riskLevel: "high",
    ...overrides,
  };
}

describe("explainPriorityScore", () => {
  it("summary total always matches computePriorityScore exactly", () => {
    const c = cap();
    const total = computePriorityScore(c, 2);
    const explanation = explainPriorityScore(c, 2);
    expect(explanation.summary).toContain(String(total));
  });

  it("matches computePriorityScore under a custom weight set too", () => {
    const c = cap();
    const weights = { businessValue: 0.7, mvpImportance: 0.1, dependencyImportance: 0.1, riskReduction: 0.1 };
    const total = computePriorityScore(c, 3, weights);
    const explanation = explainPriorityScore(c, 3, weights);
    expect(explanation.summary).toContain(String(total));
    const businessValueTerm = explanation.terms.find((t) => t.label === "Business value")!;
    expect(businessValueTerm.weight).toBe(0.7);
  });

  it("includes all four weighted terms with their weight and contribution", () => {
    const explanation = explainPriorityScore(cap(), 1);
    expect(explanation.terms).toHaveLength(4);
    for (const term of explanation.terms) {
      expect(term.weight).toBeDefined();
      expect(term.contribution).toBeDefined();
    }
  });

  it("defaults to PRIORITY_WEIGHTS when no weights are given", () => {
    const explanation = explainPriorityScore(cap(), 0);
    const businessValueTerm = explanation.terms.find((t) => t.label === "Business value")!;
    expect(businessValueTerm.weight).toBe(PRIORITY_WEIGHTS.businessValue);
  });
});
