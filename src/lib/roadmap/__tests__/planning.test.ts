import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  approvedAt: null as Date | null,
  feature: { id: "feature-a", backlogLane: "unscheduled", backlogRevision: 2, releaseId: null as string | null },
  releases: new Set(["release-a"]),
  audits: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    prototype: { findUnique: vi.fn(async () => ({ id: "prototype-a", approvedAt: state.approvedAt })) },
    release: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => state.releases.has(where.id) ? { id: where.id } : null) },
    capability: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => where.id === state.feature.id ? structuredClone(state.feature) : null),
      updateMany: vi.fn(async ({ where, data }: { where: { backlogRevision: number }; data: { backlogLane?: string; releaseId?: string | null } }) => {
        if (where.backlogRevision !== state.feature.backlogRevision) return { count: 0 };
        if (data.backlogLane !== undefined) state.feature.backlogLane = data.backlogLane;
        if (data.releaseId !== undefined) state.feature.releaseId = data.releaseId;
        state.feature.backlogRevision += 1;
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => structuredClone(state.feature)),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  auditInitiative: vi.fn(async (_id: string, action: string, metadata: Record<string, unknown>) => {
    state.audits.push({ action, metadata });
  }),
}));

vi.mock("@/lib/generation/mutation", () => ({
  withPlanningMutation: vi.fn(async (_id: string, _action: string, fn: () => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    try { return await fn(); } catch (error) {
      state.approvedAt = snapshot.approvedAt;
      state.feature = snapshot.feature;
      state.releases = snapshot.releases;
      state.audits = snapshot.audits;
      throw error;
    }
  }),
}));

import { updateRoadmapFeature } from "../planning";

beforeEach(() => {
  state.approvedAt = null;
  state.feature = { id: "feature-a", backlogLane: "unscheduled", backlogRevision: 2, releaseId: null };
  state.releases = new Set(["release-a"]);
  state.audits = [];
});

describe("roadmap planning mutation", () => {
  it("moves a feature and assigns its target release atomically", async () => {
    const result = await updateRoadmapFeature("initiative-a", "feature-a", {
      expectedRevision: 2, lane: "now", releaseId: "release-a", reason: "Committed for the next release",
    });
    expect(result).toMatchObject({ backlogLane: "now", releaseId: "release-a", backlogRevision: 3 });
    expect(state.audits[0]).toMatchObject({ action: "roadmap.feature_updated" });
  });

  it("rejects cross-initiative release ids without changing the feature", async () => {
    await expect(updateRoadmapFeature("initiative-a", "feature-a", {
      expectedRevision: 2, releaseId: "release-other", reason: "Try invalid release",
    })).rejects.toThrow("this initiative");
    expect(state.feature).toMatchObject({ backlogLane: "unscheduled", releaseId: null, backlogRevision: 2 });
    expect(state.audits).toHaveLength(0);
  });

  it("protects approved plans and stale edits", async () => {
    state.approvedAt = new Date();
    await expect(updateRoadmapFeature("initiative-a", "feature-a", {
      expectedRevision: 2, lane: "now", reason: "Move approved work",
    })).rejects.toThrow("Reopen");
    state.approvedAt = null;
    await expect(updateRoadmapFeature("initiative-a", "feature-a", {
      expectedRevision: 1, lane: "now", reason: "Stale browser",
    })).rejects.toThrow("changed");
    expect(state.feature.backlogRevision).toBe(2);
  });
});
