import { describe, expect, it } from "vitest";
import { analyzeIntakeResultSchema } from "@/lib/validation/schemas";

const validAnalysis = {
  summary: "This initiative aims to reduce onboarding drop-off.",
  assumptions: ["The target customer is a self-serve SMB user."],
  missingInformation: ["No target launch date has been entered."],
  risks: [{ description: "Success metric is not yet measurable.", severity: "medium" }],
  recommendedRoadmapPhases: [
    { name: "Foundation", description: "Core onboarding flow.", relatedCapabilities: ["Signup wizard"] },
  ],
  rationale: "Grouped by what must exist before anything else can be validated.",
};

describe("analyzeIntakeResultSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(() => analyzeIntakeResultSchema.parse(validAnalysis)).not.toThrow();
  });

  it("rejects a response missing a required field", () => {
    const rest: Record<string, unknown> = { ...validAnalysis };
    delete rest.summary;
    expect(() => analyzeIntakeResultSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid risk severity", () => {
    const bad = { ...validAnalysis, risks: [{ description: "x", severity: "catastrophic" }] };
    expect(() => analyzeIntakeResultSchema.parse(bad)).toThrow();
  });

  it("defaults relatedCapabilities to an empty array when omitted", () => {
    const withoutRelated = {
      ...validAnalysis,
      recommendedRoadmapPhases: [{ name: "Foundation", description: "Core onboarding flow." }],
    };
    const parsed = analyzeIntakeResultSchema.parse(withoutRelated);
    expect(parsed.recommendedRoadmapPhases[0].relatedCapabilities).toEqual([]);
  });

  it("has no field capable of expressing a deterministic-calculation value", () => {
    // Structural guardrail for req #13: a phase entry only ever carries
    // name/description/relatedCapabilities — never a date, sprint number,
    // or point estimate, no matter what the model tries to send.
    const withExtraFields = {
      ...validAnalysis,
      recommendedRoadmapPhases: [
        {
          name: "Foundation",
          description: "Core onboarding flow.",
          startDate: "2026-01-01",
          sprintCount: 3,
          storyPoints: 21,
        },
      ],
    };
    const parsed = analyzeIntakeResultSchema.parse(withExtraFields);
    expect(parsed.recommendedRoadmapPhases[0]).not.toHaveProperty("startDate");
    expect(parsed.recommendedRoadmapPhases[0]).not.toHaveProperty("sprintCount");
    expect(parsed.recommendedRoadmapPhases[0]).not.toHaveProperty("storyPoints");
  });
});
