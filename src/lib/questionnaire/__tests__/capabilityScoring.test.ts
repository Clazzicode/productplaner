import { describe, expect, it } from "vitest";
import { isAdvancedScoringComplete } from "@/lib/questionnaire/capabilityScoring";

describe("isAdvancedScoringComplete", () => {
  it("is true only when all four factors are present", () => {
    expect(
      isAdvancedScoringComplete({
        customerImpactScore: 3,
        revenueImpactScore: 3,
        strategicAlignmentScore: 3,
        riskComplianceScore: 3,
      }),
    ).toBe(true);
  });

  it("is false when any single factor is missing", () => {
    const complete = {
      customerImpactScore: 3,
      revenueImpactScore: 3,
      strategicAlignmentScore: 3,
      riskComplianceScore: 3,
    };
    for (const key of Object.keys(complete) as (keyof typeof complete)[]) {
      expect(isAdvancedScoringComplete({ ...complete, [key]: null })).toBe(false);
    }
  });

  it("is false when none are set", () => {
    expect(
      isAdvancedScoringComplete({
        customerImpactScore: null,
        revenueImpactScore: null,
        strategicAlignmentScore: null,
        riskComplianceScore: null,
      }),
    ).toBe(false);
  });
});
