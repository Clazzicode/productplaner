import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "proposed", record: vi.fn(), modelCall: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  demoItem: { findUnique: async () => ({ id: "demo-a", organizationId: "org-a", initiativeId: "init-a", status: "preparing", title: "Show saved roadmap", purpose: "", notes: "", completedWork: "Roadmap placement persists.", initiative: { projectId: "project-a", methodology: "agile_scrum" }, sprint: { sprintNumber: 3, sprintPlan: { goal: "Deliver planning workflow" } }, story: { title: "Save roadmap placement", body: "As a PO, I can retain placement.", children: [{ title: "Placement persists", body: "Given an edit, when saved, then it remains.", approvedAt: new Date() }] }, bug: null }) },
  demoAiSuggestion: { findUnique: async () => ({ id: "suggestion-a", demoItemId: "demo-a", kind: "purpose", status: mocks.status, model: "gpt-test", content: "Explain how saved placement makes planning reliable.", informationUsed: "Story and approved criterion" }), updateMany: vi.fn(), create: vi.fn() },
} }));
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed: vi.fn(), recordAiUsage: mocks.record }));
vi.mock("@/lib/ai/client", () => ({ AI_MODEL: "gpt-test", createAiResponse: mocks.modelCall }));

import { generateDemoDraft } from "../ai";

beforeEach(() => { mocks.status = "proposed"; mocks.record.mockReset(); mocks.modelCall.mockReset(); });

describe("demo AI drafting boundary", () => {
  it("reuses one source-grounded suggestion without another model call", async () => {
    const result = await generateDemoDraft({ demoItemId: "demo-a", kind: "purpose", userId: "user-a", organizationId: "org-a" });
    expect(result.reused).toBe(true); expect(result.suggestion.id).toBe("suggestion-a"); expect(mocks.modelCall).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DRAFT_DEMO_CONTENT", kind: "reuse" }));
  });
  it("does not regenerate unchanged content after the Product Owner dismisses it", async () => {
    mocks.status = "dismissed";
    await expect(generateDemoDraft({ demoItemId: "demo-a", kind: "purpose", userId: "user-a", organizationId: "org-a" })).rejects.toThrow("already been used or dismissed");
    expect(mocks.modelCall).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });
});
