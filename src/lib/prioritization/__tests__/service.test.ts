import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDependencyAdjustedScore, calculatePriorityScore, priorityDecisionCommand } from "../model";

const state = vi.hoisted(() => ({
  feature: { id: "feature-a", backlogRevision: 2, backlogLane: "now", _count: { dependsOnEdges: 1, dependedOnBy: 2 } },
  story: {
    id: "story-a", backlogRevision: 1,
    sourceCapability: { backlogLane: "now", _count: { dependsOnEdges: 1, dependedOnBy: 0 } },
  },
  decisions: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    initiative: { findUnique: vi.fn(async () => ({ organizationId: "org-a" })) },
    prototype: { findUnique: vi.fn(async () => ({ approvedAt: null })) },
    capability: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => where.id === state.feature.id ? structuredClone(state.feature) : null),
      update: vi.fn(async ({ data }: { data: { backlogLane?: string } }) => {
        if (data.backlogLane) state.feature.backlogLane = data.backlogLane;
        state.feature.backlogRevision += 1;
        return state.feature;
      }),
    },
    artifactLayer: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => where.id === state.story.id ? structuredClone(state.story) : null),
      update: vi.fn(async () => { state.story.backlogRevision += 1; return state.story; }),
    },
    planningRequest: { findFirst: vi.fn(), update: vi.fn() },
    requestRevision: { create: vi.fn() },
    aiAssistItem: { findFirst: vi.fn(async () => null), update: vi.fn() },
    priorityDecision: {
      findFirst: vi.fn(async () => state.decisions.at(-1) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `decision-${state.decisions.length + 1}`, createdAt: new Date("2026-10-08T01:00:00Z"),
          changedByUser: { id: "user-a", name: "Avery", email: "avery@example.com" }, ...data };
        state.decisions.push(row); return row;
      }),
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn(async (_id: string, action: string, metadata: Record<string, unknown>) => {
  state.audits.push({ action, metadata });
}) }));

vi.mock("@/lib/generation/mutation", () => ({
  withPlanningMutation: vi.fn(async (_id: string, _action: string, fn: () => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    try { return await fn(); } catch (error) {
      state.feature = snapshot.feature;
      state.story = snapshot.story;
      state.decisions = snapshot.decisions;
      state.audits = snapshot.audits;
      throw error;
    }
  }),
}));

import { savePriorityDecision } from "../service";

const factors = {
  businessValue: 5, urgency: 4, userImpact: 5, dependencyImpact: 4,
  risk: 2, effort: 3, effortPoints: 5 as const, bugSeverity: "not_applicable" as const,
};

beforeEach(() => {
  state.feature = { id: "feature-a", backlogRevision: 2, backlogLane: "now", _count: { dependsOnEdges: 1, dependedOnBy: 2 } };
  state.story = { id: "story-a", backlogRevision: 1, sourceCapability: { backlogLane: "now", _count: { dependsOnEdges: 1, dependedOnBy: 0 } } };
  state.decisions = []; state.audits = [];
});

describe("priority decision model", () => {
  it("calculates a transparent score and dependency adjustment", () => {
    const score = calculatePriorityScore(factors);
    expect(score).toBe(85);
    expect(calculateDependencyAdjustedScore(score, 1, 2)).toBe(89);
  });

  it("requires a reason and an AI source reference when applying a recommendation", () => {
    expect(priorityDecisionCommand.safeParse({
      entityType: "feature", entityId: "feature-a", expectedRevision: 2, factors,
      moscow: "must", roadmapLane: "now", reason: "", source: "manual",
    }).success).toBe(false);
    expect(priorityDecisionCommand.safeParse({
      entityType: "feature", entityId: "feature-a", expectedRevision: 2, factors,
      moscow: "must", roadmapLane: "now", reason: "Customer commitment", source: "ai",
    }).success).toBe(false);
  });
});

describe("priority decision service", () => {
  it("records a feature priority, dependency-aware order, reason and audit atomically", async () => {
    const result = await savePriorityDecision("init-a", {
      entityType: "feature", entityId: "feature-a", expectedRevision: 2, factors,
      moscow: "must", roadmapLane: "next", reason: "Unblocks two important features", source: "manual",
    }, "user-a");
    expect(state.feature).toMatchObject({ backlogRevision: 3, backlogLane: "next" });
    expect(result).toMatchObject({ score: 85, dependencyAdjustedScore: 89, reason: "Unblocks two important features", revision: 1 });
    expect(state.decisions).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: "priority.changed" });
  });

  it("rejects stale feature changes without partial writes", async () => {
    await expect(savePriorityDecision("init-a", {
      entityType: "feature", entityId: "feature-a", expectedRevision: 1, factors,
      moscow: "must", roadmapLane: "next", reason: "Stale change", source: "manual",
    }, "user-a")).rejects.toThrow("changed");
    expect(state.feature).toMatchObject({ backlogRevision: 2, backlogLane: "now" });
    expect(state.decisions).toHaveLength(0);
  });

  it("keeps story placement inherited from its feature", async () => {
    await expect(savePriorityDecision("init-a", {
      entityType: "story", entityId: "story-a", expectedRevision: 1, factors,
      moscow: "should", roadmapLane: "later", reason: "Try to move story", source: "manual",
    }, "user-a")).rejects.toThrow("inherit");
    expect(state.story.backlogRevision).toBe(1);
    expect(state.decisions).toHaveLength(0);
  });
});
