import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[], revisions: [] as Record<string, unknown>[], artifactRevisions: [] as Record<string, unknown>[],
  suggestions: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[], requestRevisions: [] as Record<string, unknown>[],
  audits: [] as string[], auditFails: false, planCommitted: true, storyRevision: 1,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = structuredClone({ rows: state.rows, revisions: state.revisions, artifactRevisions: state.artifactRevisions, suggestions: state.suggestions,
      requests: state.requests, requestRevisions: state.requestRevisions, storyRevision: state.storyRevision });
    try { return await fn(); } catch (error) {
      state.rows = before.rows; state.revisions = before.revisions; state.artifactRevisions = before.artifactRevisions;
      state.suggestions = before.suggestions; state.requests = before.requests; state.requestRevisions = before.requestRevisions;
      state.storyRevision = before.storyRevision; throw error;
    }
  },
  db: {
    initiative: { findUnique: async () => ({ organizationId: "org-a", projectId: "project-a" }) },
    user: { findUnique: async () => ({ name: "Product Owner" }) },
    organizationMember: { findFirst: async () => ({ id: "member-a" }) },
    sprintPlan: { findFirst: async () => state.planCommitted ? ({ items: [{ storyId: "story-a", bugId: null }] }) : null },
    inSprintClarification: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => state.rows.find((row) => row.dedupeKey === where.dedupeKey && row.status !== "resolved") ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => state.rows.find((row) => row.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => state.rows.find((row) => row.id === where.id)!,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "clarification-a", status: "open", answer: "", rationale: "", impact: "none",
        revision: 1, answeredAt: null, answeredByUserId: null, acknowledgedAt: null, acknowledgedByUserId: null, resolvedAt: null, resolvedByUserId: null,
        followUpRequestId: null, createdAt: new Date(), updatedAt: new Date(), ...data }; state.rows.push(row); return row; },
      updateMany: async ({ where, data }: { where: { id: string; revision: number }; data: Record<string, unknown> }) => {
        const index = state.rows.findIndex((row) => row.id === where.id && row.revision === where.revision); if (index < 0) return { count: 0 };
        const revision = Number(state.rows[index].revision) + 1; state.rows[index] = { ...state.rows[index], ...data, revision }; return { count: 1 };
      },
    },
    inSprintClarificationRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.revisions.push(data); return data; } },
    artifactLayer: {
      findUniqueOrThrow: async () => ({ id: "story-a", title: "Story", body: "Story body", backlogRevision: state.storyRevision }),
      updateMany: async ({ where }: { where: { backlogRevision: number } }) => { if (where.backlogRevision !== state.storyRevision) return { count: 0 }; state.storyRevision += 1; return { count: 1 }; },
    },
    artifactRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.artifactRevisions.push(data); return data; } },
    planningRequest: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "request-a", revision: 1, capabilityId: null, sourceRecordId: null,
        archivedAt: null, updatedAt: new Date(), ...data }; state.requests.push(row); return row; },
    },
    requestRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.requestRevisions.push(data); return data; } },
    bugPlanningRecord: { findUnique: async () => null },
    clarificationAiSuggestion: {
      findFirst: async () => null, findUnique: async () => null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const index = state.suggestions.findIndex((row) => row.id === where.id); state.suggestions[index] = { ...state.suggestions[index], ...data }; return state.suggestions[index]; },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => { if (state.auditFails) throw new Error("audit unavailable"); state.audits.push(action); } }));

import { applyClarificationCommand, createClarification } from "../service";

const createInput = { sprintId: "sprint-a", storyId: "story-a", question: "What happens when the provider is unavailable?", context: "", urgency: "normal" as const };

beforeEach(() => { state.rows = []; state.revisions = []; state.artifactRevisions = []; state.suggestions = []; state.requests = []; state.requestRevisions = [];
  state.audits = []; state.auditFails = false; state.planCommitted = true; state.storyRevision = 1; });

describe("in-sprint clarification service", () => {
  it("requires work in a committed sprint and rolls back when audit persistence fails", async () => {
    state.planCommitted = false;
    await expect(createClarification("init-a", createInput, "user-a")).rejects.toThrow("committed sprint");
    state.planCommitted = true; state.auditFails = true;
    await expect(createClarification("init-a", createInput, "user-a")).rejects.toThrow("audit unavailable");
    expect(state.rows).toEqual([]);
  });

  it("rejects duplicate questions and stale concurrent answers", async () => {
    await createClarification("init-a", createInput, "user-a");
    await expect(createClarification("init-a", createInput, "user-a")).rejects.toThrow("already open");
    await expect(applyClarificationCommand("clarification-a", { action: "answer", expectedRevision: 2, reason: "PO answer", answer: "Use the unavailable state.", rationale: "", impact: "none" }, "admin-a", true)).rejects.toThrow("changed");
  });

  it("restricts authoritative answers and records scope impact in story history", async () => {
    await createClarification("init-a", createInput, "user-a");
    const input = { action: "answer" as const, expectedRevision: 1, reason: "Scope clarified", answer: "Include retry behavior.", rationale: "Retry behavior expands the accepted scope.", impact: "scope_change" as const };
    await expect(applyClarificationCommand("clarification-a", input, "member-a", false)).rejects.toThrow("owner or administrator");
    await applyClarificationCommand("clarification-a", input, "admin-a", true);
    expect(state.revisions).toHaveLength(1); expect(state.artifactRevisions).toHaveLength(1); expect(state.storyRevision).toBe(2);
    expect(state.audits).toContain("clarification.answer");
  });

  it("allows only the requester to acknowledge an answer", async () => {
    await createClarification("init-a", createInput, "user-a");
    await applyClarificationCommand("clarification-a", { action: "answer", expectedRevision: 1, reason: "PO answer", answer: "Use the documented unavailable state.", rationale: "", impact: "none" }, "admin-a", true);
    await expect(applyClarificationCommand("clarification-a", { action: "acknowledge", expectedRevision: 2, reason: "Answer received" }, "other-user", false)).rejects.toThrow("person who asked");
    await applyClarificationCommand("clarification-a", { action: "acknowledge", expectedRevision: 2, reason: "Answer received" }, "user-a", false);
    expect(state.rows[0].status).toBe("acknowledged");
  });

  it("creates one linked follow-up request atomically from an answered clarification", async () => {
    await createClarification("init-a", createInput, "user-a");
    await applyClarificationCommand("clarification-a", { action: "answer", expectedRevision: 1, reason: "Follow-up needed",
      answer: "Create a separate resilience story.", rationale: "This work is outside the committed story.", impact: "follow_up_work" }, "admin-a", true);
    await applyClarificationCommand("clarification-a", { action: "create_follow_up", expectedRevision: 2,
      reason: "Capture the out-of-scope work", title: "Add provider resilience handling" }, "admin-a", true);
    expect(state.requests).toHaveLength(1);
    expect(state.requestRevisions).toHaveLength(1);
    expect(state.rows[0].followUpRequestId).toBe("request-a");
    await expect(applyClarificationCommand("clarification-a", { action: "create_follow_up", expectedRevision: 3,
      reason: "Duplicate follow-up", title: "Duplicate request" }, "admin-a", true)).rejects.toThrow("already exists");
  });

  it("rolls back follow-up work and the clarification link when audit persistence fails", async () => {
    await createClarification("init-a", createInput, "user-a");
    await applyClarificationCommand("clarification-a", { action: "answer", expectedRevision: 1, reason: "Follow-up needed",
      answer: "Create a separate resilience story.", rationale: "This work is outside the committed story.", impact: "follow_up_work" }, "admin-a", true);
    state.auditFails = true;
    await expect(applyClarificationCommand("clarification-a", { action: "create_follow_up", expectedRevision: 2,
      reason: "Capture the out-of-scope work", title: "Add provider resilience handling" }, "admin-a", true)).rejects.toThrow("audit unavailable");
    expect(state.requests).toEqual([]);
    expect(state.rows[0].followUpRequestId).toBeNull();
    expect(state.rows[0].revision).toBe(2);
  });
});

