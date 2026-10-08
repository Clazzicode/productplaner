import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAssistAction: vi.fn(),
  listUnifiedBacklog: vi.fn(),
}));
vi.mock("@/lib/ai/assist/runAction", () => ({ runAssistAction: mocks.runAssistAction }));
vi.mock("@/lib/backlog/unified", () => ({ listUnifiedBacklog: mocks.listUnifiedBacklog }));
vi.mock("@/lib/db", () => ({ db: { initiative: {
  findUniqueOrThrow: vi.fn().mockResolvedValue({ projectId: "project-1", organizationId: "org-1" }),
} } }));

const { runPriorityRecommendation } = await import("../recommendPriority");

const story = {
  id: "story-1", key: null, recordType: "story", workType: "story", title: "Validate map data",
  description: "As a PO, I want validation.", source: "manual", owner: null,
  status: "needs_refinement", readiness: "needs_refinement", priorityLabel: "should", priorityScore: 60,
  priorityFactors: { businessValue: 3, urgency: 3, userImpact: 3, dependencyImpact: 3, risk: 3, effort: 3, effortPoints: 5, bugSeverity: "not_applicable" },
  dependencyAdjustedScore: 58, priorityReason: "", priorityDecisionId: null, prioritySource: "derived",
  roadmapLane: "next", archived: false, revision: 1, sourceFeatureId: "feature-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listUnifiedBacklog.mockResolvedValue([story]);
});

describe("runPriorityRecommendation", () => {
  it("creates one review-only suggestion and keeps story placement inherited", async () => {
    mocks.runAssistAction.mockImplementationOnce(async options => {
      const drafts = options.buildDrafts({
        factors: { ...story.priorityFactors, businessValue: 5 },
        moscow: "must",
        roadmapLane: "now",
        reason: "Required for validation.",
        informationUsed: "The saved story and its feature placement.",
        assumptions: [],
      });
      expect(options.action).toBe("RECOMMEND_PRIORITY");
      expect(options.reuseScope).toEqual({ targetType: "priority_story", targetId: "story-1" });
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        targetType: "priority_story",
        targetId: "story-1",
        proposedContent: expect.objectContaining({ roadmapLane: "next", moscow: "must" }),
      });
      expect(drafts[0].impact).toContain("Nothing changes");
      return { decision: "generate_new", items: [{ id: "assist-priority-1" }] };
    });
    const result = await runPriorityRecommendation({
      initiativeId: "init-1", entityType: "story", entityId: "story-1",
      userId: "user-1", organizationId: "org-1",
    });
    expect(result.items).toEqual([{ id: "assist-priority-1" }]);
  });

  it("rejects cross-organization recommendations before calling ChatGPT", async () => {
    await expect(runPriorityRecommendation({
      initiativeId: "init-1", entityType: "story", entityId: "story-1",
      userId: "user-1", organizationId: "org-b",
    })).rejects.toThrow("outside this organization");
    expect(mocks.runAssistAction).not.toHaveBeenCalled();
  });
});
