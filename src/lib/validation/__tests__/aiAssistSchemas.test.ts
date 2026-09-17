import { describe, expect, it } from "vitest";
import {
  proposeFeatureCandidateSchema,
  proposeFeaturesResultSchema,
  proposeDependencyCandidateSchema,
  proposeRiskCandidateSchema,
  roadmapInsightResultSchema,
  recommendReleasesResultSchema,
  recommendSprintsResultSchema,
  recommendStatusResultSchema,
  proposeStoryContentResultSchema,
} from "@/lib/validation/schemas";

describe("roadmapInsightResultSchema", () => {
  it("accepts a well-formed insight", () => {
    expect(() =>
      roadmapInsightResultSchema.parse({
        title: "Dependency may affect timing",
        synopsis: "Feature B depends on Feature A.",
        impact: "Feature B may need to move if Feature A slips.",
        why: "Feature B has an approved dependency on Feature A.",
        informationUsed: "Approved dependency links.",
      }),
    ).not.toThrow();
  });

  it("rejects a response missing why/informationUsed", () => {
    expect(() => roadmapInsightResultSchema.parse({ title: "x", synopsis: "y", impact: "z" })).toThrow();
  });

  it("has no field capable of expressing a date/sprint/point value", () => {
    const shape = Object.keys(roadmapInsightResultSchema.shape);
    expect(shape).not.toContain("date");
    expect(shape).not.toContain("sprintNumber");
    expect(shape).not.toContain("points");
  });
});

describe("proposeFeaturesResultSchema", () => {
  const candidate = { name: "Bulk export", why: "Users asked for CSV export.", informationUsed: "Problem statement." };

  it("accepts a batch of candidates with optional sub-fields", () => {
    expect(() =>
      proposeFeaturesResultSchema.parse({ candidates: [{ ...candidate, effortSize: "m", businessValue: "high" }] }),
    ).not.toThrow();
  });

  it("accepts a candidate omitting effort/value/risk (never guess)", () => {
    expect(() => proposeFeatureCandidateSchema.parse(candidate)).not.toThrow();
  });

  it("rejects an invalid effortSize", () => {
    expect(() => proposeFeatureCandidateSchema.parse({ ...candidate, effortSize: "huge" })).toThrow();
  });

  it("caps candidates at 10", () => {
    const many = Array.from({ length: 11 }, () => candidate);
    expect(() => proposeFeaturesResultSchema.parse({ candidates: many })).toThrow();
  });
});

describe("proposeStoryContentResultSchema", () => {
  it("accepts an existing node (id set) and a new node (id null) side by side", () => {
    const result = proposeStoryContentResultSchema.parse({
      epics: [
        {
          existingArtifactLayerId: "epic-1",
          title: "Core Implementation",
          body: "Reworded body",
          stories: [
            {
              existingArtifactLayerId: null,
              title: "New story",
              body: "As a user, I want ..., so that ...",
              acceptanceCriteria: [],
            },
          ],
        },
      ],
      why: "Clearer, feature-specific wording.",
      informationUsed: "The feature's description and current story tree.",
    });
    expect(result.epics[0].existingArtifactLayerId).toBe("epic-1");
    expect(result.epics[0].stories[0].existingArtifactLayerId).toBeNull();
  });

  it("has no points/sprintId/date field anywhere in the shape", () => {
    const raw = JSON.stringify(proposeStoryContentResultSchema.shape.epics);
    expect(raw).not.toMatch(/points|sprintId/);
  });
});

describe("proposeDependencyCandidateSchema", () => {
  it("accepts a from/to capability id pair", () => {
    expect(() =>
      proposeDependencyCandidateSchema.parse({
        fromCapabilityId: "cap-2",
        toCapabilityId: "cap-1",
        why: "Bulk export needs the export pipeline first.",
        informationUsed: "Feature descriptions.",
      }),
    ).not.toThrow();
  });
});

describe("proposeRiskCandidateSchema", () => {
  it("defaults severity to medium when omitted", () => {
    const parsed = proposeRiskCandidateSchema.parse({
      description: "Vendor lock-in on the export pipeline.",
      why: "Only one vendor was mentioned.",
      informationUsed: "Problem statement.",
    });
    expect(parsed.severity).toBe("medium");
  });

  it("rejects a too-short description", () => {
    expect(() =>
      proposeRiskCandidateSchema.parse({ description: "x", why: "y", informationUsed: "z" }),
    ).toThrow();
  });
});

describe("recommendReleasesResultSchema — never a date field", () => {
  it("accepts a new-grouping recommendation with no date", () => {
    const parsed = recommendReleasesResultSchema.parse({
      recommendationType: "new_grouping",
      suggestedName: "Release 1",
      suggestedPhaseNumber: 1,
      groupedCapabilityIds: ["cap-1", "cap-2"],
      why: "These ship together for the MVP.",
      informationUsed: "Approved feature phases.",
    });
    expect(parsed.targetReleaseId).toBeNull();
  });

  it("has no field capable of expressing a target date", () => {
    expect(Object.keys(recommendReleasesResultSchema.shape)).not.toContain("targetDate");
  });
});

describe("recommendSprintsResultSchema — never a capacity field", () => {
  it("accepts an adjustment recommendation", () => {
    expect(() =>
      recommendSprintsResultSchema.parse({
        recommendationType: "adjustment",
        targetSprintId: "sprint-1",
        note: "This sprint looks over capacity.",
        storyIdsToMove: ["story-1"],
        why: "Total points exceed the given capacity.",
        informationUsed: "Existing sprint capacity and assigned points.",
      }),
    ).not.toThrow();
  });

  it("has no field capable of expressing a capacity/velocity number", () => {
    const shape = Object.keys(recommendSprintsResultSchema.shape);
    expect(shape).not.toContain("capacityPoints");
    expect(shape).not.toContain("velocity");
  });
});

describe("recommendStatusResultSchema", () => {
  it("has no color field — color always comes from the deterministic recommender", () => {
    expect(Object.keys(recommendStatusResultSchema.shape)).not.toContain("color");
  });

  it("accepts a well-formed explanation", () => {
    expect(() =>
      recommendStatusResultSchema.parse({
        impact: "The initiative may need attention soon.",
        why: "It's missing required information.",
        informationUsed: "Intake completeness.",
      }),
    ).not.toThrow();
  });
});
