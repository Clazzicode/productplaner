import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRequest } from "@/lib/requests/model";

const mocks = vi.hoisted(() => ({ runAssistAction: vi.fn() }));
vi.mock("@/lib/ai/assist/runAction", () => ({ runAssistAction: mocks.runAssistAction }));
vi.mock("@/lib/db", () => ({ db: { planningRequest: {
  findUniqueOrThrow: vi.fn().mockImplementation(({ include }: { include?: unknown }) => Promise.resolve(include ? {
      id: "request-1", initiativeId: "init-1", revision: 3, data: { ...emptyRequest(), title: "Saved views", requestor: "Tiana" },
      initiative: { id: "init-1", projectId: "project-1", organizationId: "org-1" },
    } : { data: emptyRequest(), revision: 3 })),
} } }));

const { runRequirementReview } = await import("../reviewRequirements");

beforeEach(() => vi.clearAllMocks());

describe("runRequirementReview", () => {
  it("creates individually reviewable findings and a separate readiness proposal", async () => {
    mocks.runAssistAction.mockImplementationOnce(async (options) => {
      const drafts = options.buildDrafts({
        readiness: "needs_clarification",
        summary: "Two details need Product Owner confirmation.",
        informationUsed: "The saved planning request.",
        assumptions: [],
        sources: ["PlanningRequest request-1 revision 3"],
        findings: [
          { category: "follow_up_question", fieldKey: "questions", title: "Clarify ownership", detail: "The owner is unclear.", proposedValue: "", question: "Who owns saved views?" },
          { category: "missing_business_rule", fieldKey: "businessRules", title: "Define access", detail: "Access behavior is missing.", proposedValue: "Only the creator can edit a saved view.", question: "" },
        ],
      });
      expect(options.action).toBe("REVIEW_REQUIREMENTS");
      expect(options.reuseScope).toEqual({ targetType: "request_requirement_review", targetId: "request-1" });
      expect(options.extraTiers[0].content).toContain('"requestId": "request-1"');
      expect(drafts).toHaveLength(3);
      expect(drafts[0]).toMatchObject({ targetType: "request_requirement_review", targetId: "request-1" });
      expect(drafts[1]).toMatchObject({ targetType: "request_requirement", proposedContent: expect.objectContaining({ fieldKey: "questions" }) });
      expect(drafts[2]).toMatchObject({ targetType: "request_requirement", proposedContent: expect.objectContaining({ fieldKey: "businessRules" }) });
      return { decision: "generate_new", items: [{ id: "assist-1" }] };
    });
    const result = await runRequirementReview({ requestId: "request-1", userId: "user-1", organizationId: "org-1" });
    expect(result.decision).toBe("generate_new");
    expect(result.items).toEqual([{ id: "assist-1" }]);
  });

  it("rejects a request outside the caller's organization before using ChatGPT", async () => {
    await expect(runRequirementReview({ requestId: "request-1", userId: "user-1", organizationId: "org-b" }))
      .rejects.toThrow("outside this organization");
    expect(mocks.runAssistAction).not.toHaveBeenCalled();
  });
});
