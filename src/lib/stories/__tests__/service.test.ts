import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  story: {} as Record<string, unknown>,
  revisions: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
}));

function baseStory() {
  return {
    id: "story-a",
    prototypeId: "prototype-a",
    type: "story",
    parentId: "epic-a",
    order: 0,
    title: "Save a view",
    body: "As a planner, I want to save a view, so that I can resume work.",
    points: 3,
    readinessStatus: "needs_refinement",
    sourceCapabilityId: "feature-a",
    sourceType: "manual",
    externalRef: null,
    archivedAt: null,
    backlogRevision: 1,
    sprintId: "sprint-a",
    dedupeKey: "feature:feature-a:title:save a view",
    prototype: { initiativeId: "initiative-a" },
    parent: {
      id: "epic-a",
      prototypeId: "prototype-a",
      type: "epic",
      sourceCapabilityId: "feature-a",
      parent: { id: "feature-a", type: "feature", sourceCapabilityId: "feature-a" },
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    artifactLayer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id && where.id !== state.story.id) return null;
        if (where.dedupeKey) return null;
        return structuredClone(state.story);
      }),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; backlogRevision: number };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== state.story.id || where.backlogRevision !== state.story.backlogRevision) {
          return { count: 0 };
        }
        const increment = (data.backlogRevision as { increment: number }).increment;
        state.story = {
          ...state.story,
          ...data,
          backlogRevision: Number(state.story.backlogRevision) + increment,
        };
        if (data.archivedAt instanceof Date) state.story.archivedAt = data.archivedAt;
        if (data.archivedAt === null) state.story.archivedAt = null;
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => structuredClone(state.story)),
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
    artifactRevision: {
      count: vi.fn(async () => state.revisions.length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `revision-${state.revisions.length + 1}`,
          createdAt: new Date("2026-10-08T03:00:00Z"),
          ...data,
        };
        state.revisions.push(row);
        return row;
      }),
      findMany: vi.fn(async () => structuredClone(state.revisions).reverse()),
    },
    user: {
      findMany: vi.fn(async () => [
        { id: "user-a", name: "Avery", email: "avery@example.com" },
      ]),
    },
  },
}));

vi.mock("@/lib/generation/locking", () => ({
  assertArtifactEditable: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit", () => ({
  auditInitiative: vi.fn(async (_initiativeId: string, action: string, metadata: unknown) => {
    state.audits.push({ action, metadata });
  }),
}));

vi.mock("@/lib/generation/mutation", () => ({
  withPlanningMutation: vi.fn(async (_initiativeId: string, _action: string, fn: () => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    try {
      return await fn();
    } catch (error) {
      state.story = snapshot.story;
      state.revisions = snapshot.revisions;
      state.audits = snapshot.audits;
      throw error;
    }
  }),
}));

import { listStoryHistory, updateStory } from "../service";

beforeEach(() => {
  state.story = baseStory();
  state.revisions = [];
  state.audits = [];
});

describe("story lifecycle service", () => {
  it("records the previous story before an edit and increments its revision", async () => {
    const saved = await updateStory(
      "initiative-a",
      "story-a",
      {
        expectedRevision: 1,
        title: "Save and restore a view",
        reason: "Clarified the expected outcome",
      },
      "user-a",
    );

    expect(saved).toMatchObject({
      title: "Save and restore a view",
      backlogRevision: 2,
    });
    expect(state.revisions).toHaveLength(1);
    expect(state.revisions[0]).toMatchObject({
      version: 1,
      title: "Save a view",
      reason: "Clarified the expected outcome",
      actorUserId: "user-a",
    });
    expect(state.audits[0]).toMatchObject({ action: "story.updated" });
  });

  it("rejects stale edits without leaving history or audit records", async () => {
    await expect(
      updateStory(
        "initiative-a",
        "story-a",
        {
          expectedRevision: 0,
          title: "Stale title",
          reason: "Editing an old copy",
        },
        "user-a",
      ),
    ).rejects.toThrow("changed");

    expect(state.story).toMatchObject({ title: "Save a view", backlogRevision: 1 });
    expect(state.revisions).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("archives a story without deleting it and removes it from its sprint", async () => {
    const saved = await updateStory(
      "initiative-a",
      "story-a",
      {
        expectedRevision: 1,
        archived: true,
        reason: "Superseded by a smaller story",
      },
      "user-a",
    );

    expect(saved.archivedAt).toBeInstanceOf(Date);
    expect(saved.sprintId).toBeNull();
    expect(state.audits[0]).toMatchObject({ action: "story.archived" });
  });

  it("returns immutable history with the responsible user", async () => {
    await updateStory(
      "initiative-a",
      "story-a",
      {
        expectedRevision: 1,
        readinessStatus: "ready_for_refinement",
        reason: "Requirements reviewed",
      },
      "user-a",
    );

    const history = await listStoryHistory("initiative-a", "story-a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      version: 1,
      reason: "Requirements reviewed",
      actor: { id: "user-a", name: "Avery" },
    });
  });
});
