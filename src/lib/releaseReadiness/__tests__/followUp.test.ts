import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assessment: { id: "assessment-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", releaseId: "release-a", sequence: 1, status: "needs_attention", releaseSnapshot: {}, summary: "", stakeholderCommunication: "", communicationOwnerStakeholderId: null, communicationOwnerNameSnapshot: "", communicationStatus: "not_started", decisionReason: "", revision: 1, supersedesAssessmentId: null, createdByUserId: "user-a", approvedByUserId: null, approvedAt: null, createdAt: new Date(), updatedAt: new Date() },
  checks: [{ id: "check-a", assessmentId: "assessment-a", checkKey: "quality", label: "Quality and bugs", status: "fail", explanation: "One critical bug remains open.", evidence: {}, overrideReason: "" }],
  followUps: [] as Record<string, unknown>[],
  requests: [] as Record<string, unknown>[],
  requestRevisions: [] as Record<string, unknown>[],
  assessmentRevisions: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    releaseReadinessAssessment: {
      findUnique: async () => state.assessment,
      updateMany: async ({ where }: { where: { revision: number } }) => { if (where.revision !== state.assessment.revision) return { count: 0 }; state.assessment.revision += 1; return { count: 1 }; },
    },
    releaseReadinessCheck: { findMany: async () => state.checks, findFirst: async () => state.checks[0] },
    releaseReadinessRevision: { findMany: async () => state.assessmentRevisions, create: async ({ data }: { data: Record<string, unknown> }) => { state.assessmentRevisions.push(data); return data; } },
    releaseReadinessAiSuggestion: { findMany: async () => [] },
    releaseReadinessFollowUp: {
      findMany: async () => state.followUps,
      findFirst: async () => state.followUps[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "follow-up-a", ...data }; state.followUps.push(row); return row; },
    },
    planningRequest: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "request-a", ...data }; state.requests.push(row); return row; } },
    requestRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.requestRevisions.push(data); return data; } },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));
vi.mock("../projection", () => ({ buildReleaseReadinessProjection: vi.fn() }));

import { applyReleaseReadinessCommand } from "../service";

describe("release-readiness follow-up work", () => {
  beforeEach(() => { state.assessment.revision = 1; state.followUps.length = 0; state.requests.length = 0; state.requestRevisions.length = 0; state.assessmentRevisions.length = 0; });

  it("creates one traceable intake record from a non-passing gate", async () => {
    const result = await applyReleaseReadinessCommand("assessment-a", { action: "create_follow_up", expectedRevision: 1, checkKey: "quality", title: "Resolve release quality gate", requestedChange: "Resolve the critical bug before release.", reason: "Create release follow-up" }, "user-a", true);
    expect(state.requests).toHaveLength(1);
    expect(state.requestRevisions).toHaveLength(1);
    expect(state.followUps).toEqual([expect.objectContaining({ assessmentId: "assessment-a", checkKey: "quality", planningRequestId: "request-a" })]);
    expect(result?.followUps).toHaveLength(1);
  });
});
