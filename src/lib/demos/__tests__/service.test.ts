import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  demos: [] as Record<string, unknown>[], revisions: [] as Record<string, unknown>[], audits: [] as string[],
  plans: new Map<string, { sprintNumber: number; storyIds: string[]; bugIds: string[] }>(), blockers: 0, clarifications: 0, auditFails: false,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = structuredClone({ demos: state.demos, revisions: state.revisions });
    try { return await fn(); } catch (error) { state.demos = before.demos; state.revisions = before.revisions; throw error; }
  },
  db: {
    initiative: { findUnique: async () => ({ organizationId: "org-a" }) },
    stakeholderContact: { findFirst: async ({ where }: { where: { id: string } }) => where.id === "presenter-a" ? { id: "presenter-a", displayName: "Taylor Demo" } : null },
    sprintPlan: { findFirst: async ({ where }: { where: { sprintId: string } }) => {
      const plan = state.plans.get(where.sprintId); return plan ? { sprint: { sprintNumber: plan.sprintNumber }, items: [...plan.storyIds.map(storyId => ({ storyId, bugId: null })), ...plan.bugIds.map(bugId => ({ storyId: null, bugId }))] } : null;
    } },
    demoItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `demo-${state.demos.length + 1}`, status: "proposed", purpose: "", presenterStakeholderId: null, presenterNameSnapshot: "", readinessReason: "", blockingReason: "", overrideReason: "", notes: "", completedWork: "", plannedOrder: 0, repeatReason: "", evidenceLinks: [], carryoverSprintId: null, carryoverReason: "", decidedByUserId: null, decidedAt: null, revision: 1, createdAt: new Date(), updatedAt: new Date(), ...data }; state.demos.push(row); return row; },
      findUnique: async ({ where }: { where: { id: string } }) => state.demos.find(row => row.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => state.demos.find(row => row.id === where.id)!,
      updateMany: async ({ where, data }: { where: { id: string; revision: number }; data: Record<string, unknown> }) => {
        const index = state.demos.findIndex(row => row.id === where.id && row.revision === where.revision); if (index < 0) return { count: 0 };
        const next = { ...data }; delete next.revision; state.demos[index] = { ...state.demos[index], ...next, revision: Number(state.demos[index].revision) + 1 }; return { count: 1 };
      },
    },
    demoItemRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.revisions.push(data); return data; } },
    planningBlocker: { count: async () => state.blockers },
    inSprintClarification: { count: async () => state.clarifications },
    demoAiSuggestion: { findFirst: async () => null, findUnique: async () => null, update: async () => null },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => { if (state.auditFails) throw new Error("audit unavailable"); state.audits.push(action); } }));

import { applyDemoCommand, createDemoItem } from "../service";

const createInput = { sprintId: "sprint-a", storyId: "story-a", bugId: null, capabilityId: "feature-a", title: "Show the saved roadmap", purpose: "", presenterStakeholderId: null, notes: "", completedWork: "", plannedOrder: 0, repeatReason: "", evidenceLinks: [] };

beforeEach(() => {
  state.demos = []; state.revisions = []; state.audits = []; state.blockers = 0; state.clarifications = 0; state.auditFails = false;
  state.plans = new Map([["sprint-a", { sprintNumber: 1, storyIds: ["story-a"], bugIds: [] }], ["sprint-b", { sprintNumber: 2, storyIds: ["story-a"], bugIds: [] }]]);
});

describe("demo management service", () => {
  it("requires committed sprint work and rolls back when audit persistence fails", async () => {
    state.plans.clear();
    await expect(createDemoItem("init-a", createInput, "user-a")).rejects.toThrow("committed sprint");
    state.plans.set("sprint-a", { sprintNumber: 1, storyIds: ["story-a"], bugIds: [] }); state.auditFails = true;
    await expect(createDemoItem("init-a", createInput, "user-a")).rejects.toThrow("audit unavailable");
    expect(state.demos).toEqual([]);
  });

  it("restricts readiness decisions and rejects stale concurrent updates", async () => {
    await createDemoItem("init-a", createInput, "user-a");
    await expect(applyDemoCommand("demo-1", { action: "decide", expectedRevision: 1, reason: "PO review", status: "not_ready", readinessReason: "", blockingReason: "Missing evidence", overrideReason: "" }, "member-a", false)).rejects.toThrow("owner or administrator");
    await applyDemoCommand("demo-1", { action: "update", expectedRevision: 1, reason: "Prepare the demo", title: createInput.title, purpose: "Explain the delivered customer value.", presenterStakeholderId: "presenter-a", notes: "", completedWork: "Roadmap placement now persists.", plannedOrder: 0, evidenceLinks: [] }, "member-a", false);
    await expect(applyDemoCommand("demo-1", { action: "update", expectedRevision: 1, reason: "Stale edit", title: createInput.title, purpose: "Changed", presenterStakeholderId: null, notes: "", completedWork: "Changed", plannedOrder: 0, evidenceLinks: [] }, "member-a", false)).rejects.toThrow("changed");
    expect(state.revisions).toHaveLength(1);
  });

  it("requires resolution or an explicit authorized override before readiness", async () => {
    await createDemoItem("init-a", { ...createInput, purpose: "Explain the value", presenterStakeholderId: "presenter-a", completedWork: "The story is complete." }, "user-a");
    state.blockers = 1; state.clarifications = 1;
    const command = { action: "decide" as const, expectedRevision: 1, reason: "PO readiness review", status: "ready" as const, readinessReason: "Evidence reviewed", blockingReason: "", overrideReason: "" };
    await expect(applyDemoCommand("demo-1", command, "admin-a", true)).rejects.toThrow("override reason");
    await applyDemoCommand("demo-1", { ...command, overrideReason: "Accepted for the demo because the fallback path is documented." }, "admin-a", true);
    expect(state.demos[0].status).toBe("ready"); expect(state.audits).toContain("demo.decide");
  });

  it("creates carryover atomically and retains the presenter snapshot", async () => {
    await createDemoItem("init-a", { ...createInput, purpose: "Explain the value", presenterStakeholderId: "presenter-a", completedWork: "The story is complete." }, "user-a");
    await applyDemoCommand("demo-1", { action: "decide", expectedRevision: 1, reason: "PO readiness review", status: "not_ready", readinessReason: "", blockingReason: "Environment unavailable", overrideReason: "" }, "admin-a", true);
    state.auditFails = true;
    await expect(applyDemoCommand("demo-1", { action: "carryover", expectedRevision: 2, reason: "Move unfinished demo", targetSprintId: "sprint-b", carryoverReason: "Demo environment was unavailable." }, "admin-a", true)).rejects.toThrow("audit unavailable");
    expect(state.demos).toHaveLength(1); expect(state.demos[0].status).toBe("not_ready");
    state.auditFails = false;
    await applyDemoCommand("demo-1", { action: "carryover", expectedRevision: 2, reason: "Move unfinished demo", targetSprintId: "sprint-b", carryoverReason: "Demo environment was unavailable." }, "admin-a", true);
    expect(state.demos).toHaveLength(2); expect(state.demos[0].status).toBe("carried_over"); expect(state.demos[1].presenterNameSnapshot).toBe("Taylor Demo");
  });
});
