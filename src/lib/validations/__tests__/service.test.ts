import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  validation: {} as Record<string, unknown>,
  criteria: [] as Record<string, unknown>[],
  revisions: [] as Record<string, unknown>[],
  audits: [] as string[],
  auditFails: false,
  assigned: false,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => { const before = structuredClone(state); try { return await fn(); } catch (error) { Object.assign(state, before); throw error; } },
  db: {
    productValidation: {
      findUnique: async () => state.validation.id ? state.validation : null,
      findUniqueOrThrow: async () => state.validation,
      updateMany: async ({ where, data }: { where: { revision: number }; data: Record<string, unknown> }) => { if (state.validation.revision !== where.revision) return { count: 0 }; state.validation = { ...state.validation, ...data, revision: Number(state.validation.revision) + 1 }; return { count: 1 }; },
    },
    validationCriterionResult: {
      findMany: async () => state.criteria,
      update: async ({ where, data }: { where: { validationId_criterionId: { criterionId: string } }; data: Record<string, unknown> }) => { const index = state.criteria.findIndex(c => c.criterionId === where.validationId_criterionId.criterionId); state.criteria[index] = { ...state.criteria[index], ...data }; return state.criteria[index]; },
    },
    productValidationRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.revisions.push(data); return data; }, findMany: async () => state.revisions },
    validationFollowUp: { findMany: async () => [], create: vi.fn() },
    validationAiSuggestion: { findMany: async () => [], findFirst: async () => null, update: vi.fn(), findUnique: vi.fn() },
    stakeholderContact: { findFirst: async () => state.assigned ? { id: "validator-a" } : null },
    stakeholderAssignment: { findFirst: async () => state.assigned ? { id: "assignment-a" } : null },
    planningRequest: { create: vi.fn() }, requestRevision: { create: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => { if (state.auditFails) throw new Error("audit unavailable"); state.audits.push(action); } }));

import { applyValidationCommand } from "../service";

const criterion = { criterionId: "criterion-a", result: "met" as const, reason: "", evidenceNotes: "Observed during review." };

beforeEach(() => {
  state.validation = { id: "validation-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", sprintId: "sprint-a", storyId: "story-a", status: "pending", storyVersion: 1, storySnapshot: { title: "Story A" }, evidenceNotes: "", evidenceLinks: [], decisionReason: "", validatorStakeholderId: null, validatorNameSnapshot: "", revision: 1 };
  state.criteria = [{ id: "result-a", validationId: "validation-a", criterionId: "criterion-a", criterionVersion: 1, criterionSnapshot: { title: "Criterion A" }, result: "pending", reason: "", evidenceNotes: "" }];
  state.revisions = []; state.audits = []; state.auditFails = false; state.assigned = false;
});

describe("PO validation service", () => {
  it("rejects stale updates and incomplete criterion decisions", async () => {
    await expect(applyValidationCommand("validation-a", { action: "update", expectedRevision: 2, validatorStakeholderId: null, evidenceNotes: "Evidence", evidenceLinks: [], criteria: [criterion], reason: "Save evidence" }, "user-a", false)).rejects.toThrow("changed");
    await expect(applyValidationCommand("validation-a", { action: "finalize", expectedRevision: 1, status: "accepted", decisionReason: "Accepted by PO", criteria: [{ ...criterion, result: "pending" }], createFollowUp: false, followUpTitle: "", reason: "PO decision" }, "admin-a", true)).rejects.toThrow("every acceptance criterion");
  });

  it("requires an authorized Product Owner or administrator for the final decision", async () => {
    await expect(applyValidationCommand("validation-a", { action: "finalize", expectedRevision: 1, status: "accepted", decisionReason: "Accepted by PO", criteria: [criterion], createFollowUp: false, followUpTitle: "", reason: "PO decision" }, "member-a", false)).rejects.toThrow("assigned Product Owner");
    state.assigned = true;
    await applyValidationCommand("validation-a", { action: "finalize", expectedRevision: 1, status: "accepted", decisionReason: "All approved outcomes were demonstrated.", criteria: [criterion], createFollowUp: false, followUpTitle: "", reason: "PO accepted delivery" }, "po-a", false);
    expect(state.validation.status).toBe("accepted");
    expect(state.audits).toContain("validation.accepted");
  });

  it("rolls back evidence, revision history, and status when audit persistence fails", async () => {
    state.auditFails = true;
    await expect(applyValidationCommand("validation-a", { action: "update", expectedRevision: 1, validatorStakeholderId: null, evidenceNotes: "New evidence", evidenceLinks: [], criteria: [criterion], reason: "Save evidence" }, "member-a", false)).rejects.toThrow("audit unavailable");
    expect(state.validation.revision).toBe(1);
    expect(state.criteria[0].result).toBe("pending");
    expect(state.revisions).toEqual([]);
  });
});
