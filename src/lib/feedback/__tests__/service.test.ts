import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  feedback: {} as Record<string, unknown>,
  revisions: [] as Record<string, unknown>[],
  proposals: [] as Record<string, unknown>[],
  audits: [] as string[],
  auditFails: false,
  priorityFails: false,
  assignedProductOwner: false,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = structuredClone(state);
    try {
      return await fn();
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  },
  db: {
    feedbackRecord: {
      findUnique: async () => (state.feedback.id ? state.feedback : null),
      findUniqueOrThrow: async () => state.feedback,
      updateMany: async ({ where, data }: { where: { revision: number }; data: Record<string, unknown> }) => {
        if (state.feedback.revision !== where.revision) return { count: 0 };
        state.feedback = { ...state.feedback, ...data, revision: Number(state.feedback.revision) + 1 };
        return { count: 1 };
      },
    },
    feedbackRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.revisions.push(data);
        return data;
      },
      findMany: async () => state.revisions,
    },
    feedbackFollowUp: { findMany: async () => [], findFirst: async () => null, create: vi.fn() },
    feedbackAiSuggestion: {
      findMany: async () => [], findFirst: async () => null, findUnique: vi.fn(), update: vi.fn(),
    },
    reprioritizationProposal: {
      findMany: async () => state.proposals,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `proposal-${state.proposals.length + 1}`, status: "proposed", revision: 1, ...data };
        state.proposals.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => state.proposals.find((item) => item.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; revision: number }; data: Record<string, unknown> }) => {
        const index = state.proposals.findIndex((item) => item.id === where.id && item.revision === where.revision);
        if (index < 0) return { count: 0 };
        state.proposals[index] = { ...state.proposals[index], ...data, revision: Number(state.proposals[index].revision) + 1 };
        return { count: 1 };
      },
    },
    capability: { findFirst: async () => ({ backlogRevision: 2, backlogLane: "next", name: "Reporting", businessValue: "high", riskLevel: "medium" }) },
    priorityDecision: { findFirst: async () => null },
    planningRequest: { findFirst: vi.fn() },
    artifactLayer: { findFirst: vi.fn() },
    stakeholderContact: { findFirst: async () => state.assignedProductOwner ? { id: "contact-a" } : null },
    stakeholderAssignment: { findFirst: async () => state.assignedProductOwner ? { id: "assignment-a" } : null },
  },
}));

vi.mock("@/lib/prioritization/service", () => ({
  savePriorityDecision: async () => {
    if (state.priorityFails) throw new Error("priority failed");
    return { id: "decision-a" };
  },
}));

vi.mock("@/lib/audit", () => ({
  auditInitiative: async (_id: string, action: string) => {
    if (state.auditFails) throw new Error("audit unavailable");
    state.audits.push(action);
  },
}));

import { applyFeedbackCommand, applyProposalCommand } from "../service";

const proposal = {
  entityType: "feature" as const,
  entityId: "feature-a",
  expectedEntityRevision: 2,
  factors: { businessValue: 5, urgency: 4, userImpact: 5, dependencyImpact: 3, risk: 3, effort: 3, effortPoints: 3 as const, bugSeverity: "not_applicable" as const },
  moscow: "must" as const,
  roadmapLane: "now" as const,
  rationale: "Repeated customer feedback supports higher priority.",
  source: "manual" as const,
  suggestionId: null,
};

async function createProposal() {
  await applyFeedbackCommand("feedback-a", { action: "create_proposal", expectedRevision: 1, proposal, reason: "Create priority proposal" }, "po-a");
}

beforeEach(() => {
  state.feedback = { id: "feedback-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", title: "Reporting feedback", details: "Customers cannot find reports.", source: "customer", sourceReference: null, category: "usability", status: "captured", summary: "", linkedEntityType: "feature", linkedEntityId: "feature-a", revision: 1 };
  state.revisions = [];
  state.proposals = [];
  state.audits = [];
  state.auditFails = false;
  state.priorityFails = false;
  state.assignedProductOwner = false;
});

describe("feedback and reprioritization service", () => {
  it("rejects stale changes and records proposals without changing priority", async () => {
    await expect(applyFeedbackCommand("feedback-a", { action: "update", expectedRevision: 2, title: "Reporting feedback", details: "Customers cannot find reports.", category: "usability", status: "triaged", summary: "", link: { entityType: "feature", entityId: "feature-a" }, reason: "Triage feedback" }, "user-a")).rejects.toThrow("changed");
    await createProposal();
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0].status).toBe("proposed");
  });

  it("allows an administrator to apply a proposal with a human rationale", async () => {
    await createProposal();
    await applyProposalCommand("proposal-1", { action: "apply", expectedRevision: 1, decisionReason: "PO approved the customer-impact evidence." }, "admin-a", true);
    expect(state.proposals[0]).toMatchObject({ status: "applied", appliedPriorityDecisionId: "decision-a", decisionReason: "PO approved the customer-impact evidence." });
    expect(state.audits).toContain("feedback.reprioritization_apply");
  });

  it("allows an assigned Product Owner and rejects an unassigned member", async () => {
    await createProposal();
    await expect(applyProposalCommand("proposal-1", { action: "apply", expectedRevision: 1, decisionReason: "Apply the validated feedback." }, "member-a", false)).rejects.toMatchObject({ status: 403 });
    state.assignedProductOwner = true;
    await applyProposalCommand("proposal-1", { action: "apply", expectedRevision: 1, decisionReason: "Apply the validated feedback." }, "member-a", false);
    expect(state.proposals[0].status).toBe("applied");
  });

  it("rolls back proposal state when the authoritative priority mutation fails", async () => {
    await createProposal();
    state.priorityFails = true;
    await expect(applyProposalCommand("proposal-1", { action: "apply", expectedRevision: 1, decisionReason: "PO approved the feedback." }, "admin-a", true)).rejects.toThrow("priority failed");
    expect(state.proposals[0].status).toBe("proposed");
  });

  it("rolls back feedback and revision history when audit persistence fails", async () => {
    state.auditFails = true;
    await expect(applyFeedbackCommand("feedback-a", { action: "update", expectedRevision: 1, title: "Updated title", details: "Updated customer feedback.", category: "usability", status: "triaged", summary: "Reviewed", link: null, reason: "Triage feedback" }, "user-a")).rejects.toThrow("audit unavailable");
    expect(state.feedback.title).toBe("Reporting feedback");
    expect(state.feedback.revision).toBe(1);
    expect(state.revisions).toEqual([]);
  });
});
