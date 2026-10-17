import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ demoStatus: "demonstrated", createdDemoItemId: "" }));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    sprintPlan: { findFirst: async () => ({ organizationId: "org-a", initiative: { projectId: "project-a" }, items: [{ story: { id: "story-a", title: "Delivered story", body: "Story body", contentJson: {}, backlogRevision: 3, updatedAt: new Date("2026-10-17T12:00:00Z"), children: [{ id: "criterion-a", title: "Outcome", body: "Works", contentJson: {}, backlogRevision: 2, approvedAt: new Date("2026-10-16T12:00:00Z"), updatedAt: new Date("2026-10-16T12:00:00Z") }] } }] }) },
    demoItem: { findFirst: async () => state.demoStatus === "demonstrated" ? { id: "demo-a", status: "demonstrated", updatedAt: new Date() } : null },
    sprintReview: { findFirst: vi.fn() },
    productValidation: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { state.createdDemoItemId = String(data.demoItemId); return { id: "validation-a", ...data, status: "pending", evidenceNotes: "", evidenceLinks: [], decisionReason: "", validatorStakeholderId: null, validatorNameSnapshot: "", revision: 1 }; },
      findUnique: async () => ({ id: "validation-a", status: "pending" }),
    },
    validationCriterionResult: { createMany: vi.fn(), findMany: async () => [] },
    productValidationRevision: { findMany: async () => [] },
    validationFollowUp: { findMany: async () => [] },
    validationAiSuggestion: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));

import { createValidation } from "../service";

beforeEach(() => { state.demoStatus = "demonstrated"; state.createdDemoItemId = ""; });

describe("Product Owner validation creation", () => {
  it("requires demonstrated delivery evidence", async () => {
    state.demoStatus = "planned";
    await expect(createValidation("init-a", { sprintId: "sprint-a", storyId: "story-a" }, "user-a")).rejects.toThrow("requires demonstrated work");
  });

  it("automatically links the demonstrated item when the caller omits its id", async () => {
    await createValidation("init-a", { sprintId: "sprint-a", storyId: "story-a" }, "user-a");
    expect(state.createdDemoItemId).toBe("demo-a");
  });
});
