import { describe, expect, it } from "vitest";
import { assessRoadmapReadiness, readinessPercent } from "./roadmapReadiness";

const completeInput = {
  name: "Customer onboarding modernization",
  problemStatement: "New customers take too long to reach their first successful outcome.",
  targetCustomer: "Operations managers",
  outcomeStatement: "Reduce time to first value by improving onboarding completion.",
  outcomeMetric: "Median time to first value below one day",
  targetLaunchDate: "2027-01-15",
  budget: "175000",
  capabilities: [{ name: "Guided setup", description: "Personalized onboarding steps.", isMvp: true }],
  teamSize: 5,
  historicalVelocityPoints: 32,
} as const;

describe("roadmap readiness", () => {
  it("reports no gaps for a complete roadmap brief", () => {
    const gaps = assessRoadmapReadiness(completeInput);
    expect(gaps).toEqual([]);
    expect(readinessPercent(gaps)).toBe(100);
  });

  it("separates generation blockers from confidence recommendations", () => {
    const gaps = assessRoadmapReadiness({
      ...completeInput,
      problemStatement: "Too slow",
      outcomeMetric: "",
      capabilities: [{ name: "Dashboard", description: "", isMvp: false }],
    });

    expect(gaps.some((gap) => gap.severity === "required" && gap.section === 0)).toBe(true);
    expect(gaps.some((gap) => gap.severity === "required" && gap.section === 2)).toBe(true);
    expect(gaps.some((gap) => gap.severity === "recommended" && gap.section === 1)).toBe(true);
    expect(gaps.some((gap) => gap.severity === "recommended" && gap.section === 2)).toBe(true);
  });

  it("flags dependency conflicts before the detailed generator is called", () => {
    const gaps = assessRoadmapReadiness({
      ...completeInput,
      capabilities: [
        { id: "a", name: "First", description: "First feature", isMvp: true, dependsOn: ["b"] },
        { id: "b", name: "Second", description: "Second feature", isMvp: false, dependsOn: ["a"] },
      ],
    });
    expect(gaps.map((gap) => gap.label)).toContain("Resolve circular feature dependencies");
    expect(gaps.map((gap) => gap.label)).toContain("Resolve MVP dependency conflicts");
  });
});
