import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "proposed", record: vi.fn(), modelCall: vi.fn() }));
vi.mock("../service", () => ({ loadReviewDetails: async () => ({ review: { id: "review-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", status: "draft", draftSnapshot: { readyDemos: [{ title: "Show saved planning" }] }, summary: "" }, meeting: { purpose: "Review value", notes: "Evidence reviewed", transcriptText: "", outcome: "Accepted" }, decisions: [], actions: [] }) }));
vi.mock("@/lib/db", () => ({ db: { sprintReviewAiSuggestion: {
  findMany: async () => [{ id: "suggestion-a", reviewId: "review-a", kind: "summary", status: mocks.status, fingerprint: "a".repeat(64), content: "The sprint delivered the documented value.", informationUsed: "Agenda and notes", model: "gpt-test" }], updateMany: vi.fn(), createMany: vi.fn(),
} } }));
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed: vi.fn(), recordAiUsage: mocks.record }));
vi.mock("@/lib/ai/client", () => ({ AI_MODEL: "gpt-test", createAiResponse: mocks.modelCall }));

import { generateSprintReviewDraft } from "../ai";

beforeEach(() => { mocks.status = "proposed"; mocks.record.mockReset(); mocks.modelCall.mockReset(); });

describe("sprint review AI boundary", () => {
  it("reuses source-grounded suggestions without another model call", async () => {
    const result = await generateSprintReviewDraft({ reviewId: "review-a", userId: "user-a", organizationId: "org-a" });
    expect(result.reused).toBe(true); expect(result.suggestions).toHaveLength(1); expect(mocks.modelCall).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DRAFT_SPRINT_REVIEW", kind: "reuse" }));
  });
  it("does not regenerate unchanged suggestions after Product Owner action", async () => {
    mocks.status = "dismissed";
    await expect(generateSprintReviewDraft({ reviewId: "review-a", userId: "user-a", organizationId: "org-a" })).rejects.toThrow("already been used or dismissed");
    expect(mocks.modelCall).not.toHaveBeenCalled();
  });
});
