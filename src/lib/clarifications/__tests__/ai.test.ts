import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "proposed", record: vi.fn(), create: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    inSprintClarification: { findUnique: async () => ({
      id: "clarification-a", organizationId: "org-a", initiativeId: "init-a", status: "open",
      question: "What happens when the provider is unavailable?", context: "The story covers the normal path.", urgency: "high",
      initiative: { id: "init-a", projectId: "project-a", methodology: "agile_scrum" },
      sprint: { sprintNumber: 3, startDate: new Date("2026-10-01"), endDate: new Date("2026-10-14"), sprintPlan: { goal: "Improve resilience" } },
      story: { title: "Provider fallback", body: "As a user, I need a clear unavailable state.", backlogRevision: 2,
        children: [{ title: "Unavailable state", body: "Show the unavailable state after a provider failure.", approvedAt: new Date("2026-09-30") }] },
      bug: null,
    }) },
    clarificationAiSuggestion: {
      findUnique: async () => ({ id: "suggestion-a", clarificationId: "clarification-a", status: mocks.status,
        model: "gpt-test", draftAnswer: "Use the documented unavailable state.", informationUsed: "Story and approved criterion" }),
      updateMany: vi.fn(), create: mocks.create,
    },
  },
}));
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed: vi.fn(), recordAiUsage: mocks.record }));
vi.mock("@/lib/ai/client", () => ({ AI_MODEL: "gpt-test", createAiResponse: mocks.create }));

import { generateClarificationDraft } from "../ai";

beforeEach(() => { mocks.status = "proposed"; mocks.record.mockReset(); mocks.create.mockReset(); });

describe("clarification AI reuse boundary", () => {
  it("reuses the stored source-grounded draft without another model call", async () => {
    const result = await generateClarificationDraft({ clarificationId: "clarification-a", userId: "admin-a", organizationId: "org-a" });
    expect(result.reused).toBe(true);
    expect(result.suggestion.id).toBe("suggestion-a");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DRAFT_CLARIFICATION", kind: "reuse" }));
  });

  it("does not resurrect a dismissed draft or spend another AI call on unchanged input", async () => {
    mocks.status = "dismissed";
    await expect(generateClarificationDraft({ clarificationId: "clarification-a", userId: "admin-a", organizationId: "org-a" }))
      .rejects.toThrow("was dismissed");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
