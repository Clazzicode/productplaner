import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: "proposed", record: vi.fn(), modelCall: vi.fn() }));
vi.mock("../service", () => ({ loadValidation: async () => ({ validation: { id: "validation-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", status: "pending", storySnapshot: { title: "Delivered story" }, evidenceNotes: "Demo completed", evidenceLinks: [] }, criteria: [{ criterionSnapshot: { title: "Outcome is visible" } }] }) }));
vi.mock("@/lib/db", () => ({ db: { validationAiSuggestion: {
  findUnique: async () => ({ id: "suggestion-a", validationId: "validation-a", status: mocks.status, fingerprint: "a".repeat(64), content: "The supplied evidence covers the demonstrated outcome.", informationUsed: "Story, criteria, and evidence", model: "gpt-test" }),
  updateMany: vi.fn(), create: vi.fn(),
} } }));
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed: vi.fn(), recordAiUsage: mocks.record }));
vi.mock("@/lib/ai/client", () => ({ AI_MODEL: "gpt-test", createAiResponse: mocks.modelCall }));

import { generateValidationEvidence } from "../ai";

beforeEach(() => { mocks.status = "proposed"; mocks.record.mockReset(); mocks.modelCall.mockReset(); });

describe("validation AI boundary", () => {
  it("reuses an unchanged source-grounded draft without another model call", async () => {
    const result = await generateValidationEvidence({ validationId: "validation-a", userId: "user-a", organizationId: "org-a" });
    expect(result.reused).toBe(true);
    expect(mocks.modelCall).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DRAFT_VALIDATION_EVIDENCE", kind: "reuse" }));
  });

  it("does not regenerate a used or dismissed draft until evidence changes", async () => {
    mocks.status = "dismissed";
    await expect(generateValidationEvidence({ validationId: "validation-a", userId: "user-a", organizationId: "org-a" })).rejects.toThrow("already been used or dismissed");
    expect(mocks.modelCall).not.toHaveBeenCalled();
  });
});
