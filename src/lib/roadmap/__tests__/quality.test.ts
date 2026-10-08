import { describe, expect, it } from "vitest";
import { dependencyWarnings, deriveReleaseQuality, roadmapViewsForMethodology, supportedRoadmapMethodologies } from "../quality";

describe("roadmap quality", () => {
  it("counts only active defects and raises risk for blockers and severe defects", () => {
    expect(deriveReleaseQuality({
      defects: [
        { severity: "critical", status: "reported" },
        { severity: "high", status: "resolved" },
      ],
      blockerCount: 0,
    })).toEqual({ defectCount: 1, blockerCount: 0, qualityRisk: "critical" });
    expect(deriveReleaseQuality({ defects: [], blockerCount: 1 })).toEqual({
      defectCount: 0, blockerCount: 1, qualityRisk: "high",
    });
  });

  it("warns when dependencies are placed later or target later releases", () => {
    expect(dependencyWarnings({
      featureLane: "now",
      releaseTargetDate: new Date("2027-03-01"),
      dependencies: [
        { name: "Identity", lane: "next", releaseTargetDate: new Date("2027-04-01") },
        { name: "Data model", lane: "now", releaseTargetDate: null },
      ],
    })).toEqual([
      "Identity is planned after this feature.",
      "Identity targets a later release.",
      "Data model has no target release.",
    ]);
  });

  it("keeps both roadmap views available across supported methodologies", () => {
    for (const methodology of supportedRoadmapMethodologies) {
      expect(roadmapViewsForMethodology(methodology)).toEqual({ planning: true, timeline: true });
    }
    expect(roadmapViewsForMethodology("unknown")).toEqual({ planning: true, timeline: false });
  });
});
