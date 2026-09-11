import { describe, expect, it } from "vitest";
import { explainRoadmapPlacement } from "../roadmapPlacement";

describe("explainRoadmapPlacement", () => {
  it("explains a manual override, taking priority over the automatic rule", () => {
    const explanation = explainRoadmapPlacement({ isMvp: true, businessValue: "low", manualPhaseOverride: 3 });
    expect(explanation.summary).toContain("Phase 3");
    expect(explanation.summary).toContain("manually");
  });

  it("explains Phase 1 for an MVP feature", () => {
    const explanation = explainRoadmapPlacement({ isMvp: true, businessValue: "low" });
    expect(explanation.summary).toContain("Phase 1");
    expect(explanation.summary).toContain("MVP");
  });

  it("explains Phase 2 for a non-MVP feature with high business value", () => {
    const explanation = explainRoadmapPlacement({ isMvp: false, businessValue: "high" });
    expect(explanation.summary).toContain("Phase 2");
  });

  it("explains Phase 2 for a non-MVP feature with critical business value", () => {
    const explanation = explainRoadmapPlacement({ isMvp: false, businessValue: "critical" });
    expect(explanation.summary).toContain("Phase 2");
  });

  it("explains Phase 3 for a non-MVP feature with medium or lower business value", () => {
    const explanation = explainRoadmapPlacement({ isMvp: false, businessValue: "medium" });
    expect(explanation.summary).toContain("Phase 3");
  });
});
