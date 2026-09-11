import { describe, expect, it } from "vitest";
import type { CapabilityInput } from "@/lib/generation/types";
import { explainDependencySequencing } from "../dependencySequencing";

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
    ...overrides,
  };
}

describe("explainDependencySequencing", () => {
  it("describes a feature with no dependencies and nothing depending on it", () => {
    const a = cap({ id: "a" });
    const explanation = explainDependencySequencing(a, [a]);
    expect(explanation.summary).toContain("No dependencies");
    expect(explanation.terms).toEqual([
      { label: "Depends on", value: 0 },
      { label: "Other features depending on this", value: 0 },
    ]);
  });

  it("counts dependencies and dependents correctly", () => {
    const a = cap({ id: "a" });
    const b = cap({ id: "b", dependsOn: ["a"] });
    const c = cap({ id: "c", dependsOn: ["a"] });
    const explanation = explainDependencySequencing(a, [a, b, c]);
    expect(explanation.terms).toEqual([
      { label: "Depends on", value: 0 },
      { label: "Other features depending on this", value: 2 },
    ]);
    expect(explanation.summary).toContain("2 other features wait");
  });

  it("flags a feature involved in a circular dependency", () => {
    const a = cap({ id: "a", dependsOn: ["b"] });
    const b = cap({ id: "b", dependsOn: ["a"] });
    const explanation = explainDependencySequencing(a, [a, b]);
    expect(explanation.summary).toContain("circular dependency");
  });

  it("describes a feature with real dependencies, singular/plural handled", () => {
    const a = cap({ id: "a" });
    const b = cap({ id: "b", dependsOn: ["a"] });
    const explanation = explainDependencySequencing(b, [a, b]);
    expect(explanation.summary).toContain("1 dependency");
  });
});
