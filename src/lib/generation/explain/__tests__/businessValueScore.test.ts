import { describe, expect, it } from "vitest";
import { computeBusinessValueScore } from "@/lib/generation/scoring";
import { explainBusinessValueScore } from "../businessValueScore";

describe("explainBusinessValueScore", () => {
  it("returns an honest 'direct pick' explanation when no sub-factors are present", () => {
    const explanation = explainBusinessValueScore({ businessValue: "high" });
    expect(explanation.summary).toContain("directly");
    expect(explanation.terms).toEqual([{ label: "Business value (direct pick)", value: "high" }]);
  });

  it("returns an honest 'direct pick' explanation when sub-factors are partial", () => {
    const explanation = explainBusinessValueScore({
      businessValue: "medium",
      customerImpactScore: 3,
      revenueImpactScore: null,
      strategicAlignmentScore: 3,
      riskComplianceScore: 3,
    });
    expect(explanation.summary).toContain("directly");
  });

  it("breaks down the four weighted sub-factors when all are present", () => {
    const cap = {
      businessValue: "high" as const,
      customerImpactScore: 5,
      revenueImpactScore: 4,
      strategicAlignmentScore: 3,
      riskComplianceScore: 2,
    };
    const score = computeBusinessValueScore(cap);
    const explanation = explainBusinessValueScore(cap);
    expect(explanation.summary).toContain(String(score));
    expect(explanation.terms).toHaveLength(4);
    expect(explanation.terms.map((t) => t.label)).toEqual([
      "Customer impact",
      "Revenue impact",
      "Strategic alignment",
      "Risk / compliance impact",
    ]);
  });

  it("matches computeBusinessValueScore under a custom weight set", () => {
    const cap = {
      businessValue: "critical" as const,
      customerImpactScore: 5,
      revenueImpactScore: 5,
      strategicAlignmentScore: 5,
      riskComplianceScore: 5,
    };
    const weights = { customerImpact: 0.4, revenueImpact: 0.4, strategicAlignment: 0.1, riskCompliance: 0.1 };
    const score = computeBusinessValueScore(cap, weights);
    const explanation = explainBusinessValueScore(cap, weights);
    expect(explanation.summary).toContain(String(score));
  });
});
