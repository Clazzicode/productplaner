import { describe, expect, it } from "vitest";
import { computeEffectiveCapacity } from "@/lib/generation/cost";
import { explainSprintCapacity } from "../sprintCapacity";

describe("explainSprintCapacity", () => {
  it("uses the hours model when its inputs are present, and matches computeEffectiveCapacity exactly", () => {
    const input = {
      teamSize: 5,
      velocityPerPersonPerSprint: 8,
      capacityBufferPercent: 15,
      hoursPerSprintPerMember: 80,
      utilizationRatePercent: 70,
      hoursPerStoryPoint: 8,
    };
    const capacity = computeEffectiveCapacity(input);
    const explanation = explainSprintCapacity(input);
    expect(explanation.summary).toContain(`${capacity} points`);
    expect(explanation.terms.some((t) => t.label === "Hours per story point")).toBe(true);
  });

  it("falls back to the legacy points model when hours-model inputs are absent", () => {
    const input = { teamSize: 4, velocityPerPersonPerSprint: 6, capacityBufferPercent: 10 };
    const capacity = computeEffectiveCapacity(input);
    const explanation = explainSprintCapacity(input);
    expect(explanation.summary).toContain(`${capacity} points`);
    expect(explanation.terms.some((t) => t.label === "Velocity per person per sprint")).toBe(true);
  });

  it("notes when historical velocity caps the estimate", () => {
    const input = {
      teamSize: 10,
      velocityPerPersonPerSprint: 8,
      capacityBufferPercent: 0,
      hoursPerSprintPerMember: 80,
      utilizationRatePercent: 100,
      hoursPerStoryPoint: 1,
      historicalVelocityPoints: 5,
    };
    const explanation = explainSprintCapacity(input);
    expect(explanation.summary).toContain("capped by historical velocity (5 points)");
  });

  it("does not claim a historical cap when historical velocity isn't actually binding", () => {
    const input = {
      teamSize: 1,
      velocityPerPersonPerSprint: 1,
      capacityBufferPercent: 0,
      hoursPerSprintPerMember: 1,
      utilizationRatePercent: 1,
      hoursPerStoryPoint: 100,
      historicalVelocityPoints: 500,
    };
    const explanation = explainSprintCapacity(input);
    expect(explanation.summary).not.toContain("capped by historical velocity");
  });
});
