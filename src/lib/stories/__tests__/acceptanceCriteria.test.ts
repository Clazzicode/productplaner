import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  story: {} as Record<string, unknown>,
  criterion: {} as Record<string, unknown>,
  duplicate: false,
  revisions: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
}));

function baseStory() {
  return {
    id: "story-a",
    prototypeId: "prototype-a",
    type: "story",
    parentId: "epic-a",
    sourceCapabilityId: "feature-a",
    archivedAt: null,
    prototype: { initiativeId: "initiative-a" },
    parent: {
      id: "epic-a",
      type: "epic",
      parent: { id: "feature-a", type: "feature", sourceCapabilityId: "feature-a" },
    },
  };
}

function baseCriterion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "criterion-a",
    prototypeId: "prototype-a",
    type: "acceptance_criterion",
    parentId: "story-a",
    order: 0,
    title: "Restore saved filters",
    body: "Given a saved view, when I reopen it, then every saved filter is displayed.",
    sourceCapabilityId: "feature-a",
    sourceType: "manual",
    dedupeKey: "criterion-key",
    approvedAt: null,
    approvedByUserId: null,
    archivedAt: null,
    backlogRevision: 1,
    prototype: { initiativeId: "initiative-a" },
    parent: { id: "story-a", type: "story", archivedAt: null },
    ...overrides,
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    artifactLayer: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.type === "story") return structuredClone(state.story);
        if (where.id && where.type === "acceptance_criterion") {
          return where.id === state.criterion.id ? structuredClone(state.criterion) : null;
        }
        if (where.dedupeKey) return state.duplicate ? { id: "criterion-duplicate" } : null;
        return null;
      }),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.criterion = baseCriterion({ ...data, id: "criterion-created" });
        return structuredClone(state.criterion);
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; backlogRevision: number };
        data: Record<string, unknown>;
      }) => {
        if (
          where.id !== state.criterion.id ||
          where.backlogRevision !== state.criterion.backlogRevision
        ) {
          return { count: 0 };
        }
        const increment =
          (data.backlogRevision as { increment?: number } | undefined)?.increment ?? 0;
        state.criterion = {
          ...state.criterion,
          ...data,
          backlogRevision: Number(state.criterion.backlogRevision) + increment,
        };
        if (data.archivedAt instanceof Date) state.criterion.archivedAt = data.archivedAt;
        if (data.archivedAt === null) state.criterion.archivedAt = null;
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => structuredClone(state.criterion)),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => undefined),
    },
    artifactRevision: {
      count: vi.fn(async () => state.revisions.length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `revision-${state.revisions.length + 1}`,
          createdAt: new Date("2026-10-08T04:00:00Z"),
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
  withPlanningMutation: vi.fn(async (
    _initiativeId: string,
    _action: string,
    fn: () => Promise<unknown>,
  ) => {
    const snapshot = structuredClone(state);
    try {
      return await fn();
    } catch (error) {
      state.story = snapshot.story;
      state.criterion = snapshot.criterion;
      state.duplicate = snapshot.duplicate;
      state.revisions = snapshot.revisions;
      state.audits = snapshot.audits;
      throw error;
    }
  }),
}));

import {
  approveAcceptanceCriterion,
  createAcceptanceCriterion,
  listAcceptanceCriterionHistory,
  updateAcceptanceCriterion,
} from "../service";

beforeEach(() => {
  state.story = baseStory();
  state.criterion = baseCriterion();
  state.duplicate = false;
  state.revisions = [];
  state.audits = [];
});

describe("acceptance criterion lifecycle service", () => {
  it("creates a manual criterion with source traceability and an audit event", async () => {
    const created = await createAcceptanceCriterion(
      "initiative-a",
      "story-a",
      {
        title: "Restore saved filters",
        body: "Given a saved view, when I reopen it, then every saved filter is displayed.",
        sourceType: "manual",
      },
      "user-a",
    );

    expect(created).toMatchObject({
      id: "criterion-created",
      sourceType: "manual",
      traceNote: "Created manually by the Product Owner.",
    });
    expect(state.audits[0]).toMatchObject({ action: "acceptance_criterion.created" });
  });

  it("rejects a stale edit without leaving a revision or audit record", async () => {
    await expect(
      updateAcceptanceCriterion(
        "initiative-a",
        "criterion-a",
        {
          expectedRevision: 0,
          title: "Stale title",
          reason: "Editing an old copy",
        },
        "user-a",
      ),
    ).rejects.toThrow("changed");

    expect(state.criterion).toMatchObject({
      title: "Restore saved filters",
      backlogRevision: 1,
    });
    expect(state.revisions).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("reopens an approved criterion when its content changes and preserves history", async () => {
    state.criterion = baseCriterion({
      approvedAt: new Date("2026-10-07T12:00:00Z"),
      approvedByUserId: "user-owner",
    });

    const saved = await updateAcceptanceCriterion(
      "initiative-a",
      "criterion-a",
      {
        expectedRevision: 1,
        body: "Given a saved view, when I reopen it, then every saved filter and sort is displayed.",
        reason: "Added the expected sort behavior",
      },
      "user-a",
    );

    expect(saved).toMatchObject({
      approvedAt: null,
      approvedByUserId: null,
      backlogRevision: 2,
    });
    expect(state.revisions[0]).toMatchObject({
      version: 1,
      reason: "Added the expected sort behavior",
      actorUserId: "user-a",
    });
    expect(state.audits[0]).toMatchObject({ action: "acceptance_criterion.reopened" });
  });

  it("archives and restores a criterion without deleting its record", async () => {
    const archived = await updateAcceptanceCriterion(
      "initiative-a",
      "criterion-a",
      {
        expectedRevision: 1,
        archived: true,
        reason: "No longer applies to this story",
      },
      "user-a",
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(state.audits[0]).toMatchObject({ action: "acceptance_criterion.archived" });

    const restored = await updateAcceptanceCriterion(
      "initiative-a",
      "criterion-a",
      {
        expectedRevision: 2,
        archived: false,
        reason: "Required after scope review",
      },
      "user-a",
    );
    expect(restored.archivedAt).toBeNull();
    expect(state.audits[1]).toMatchObject({ action: "acceptance_criterion.restored" });
  });

  it("rejects vague approval and atomically approves an adequate criterion", async () => {
    state.criterion = baseCriterion({
      body: "Given a view, when I save it, then it works correctly.",
    });
    await expect(
      approveAcceptanceCriterion(
        "initiative-a",
        "criterion-a",
        "user-a",
        { expectedRevision: 1, comment: "Reviewed for approval" },
      ),
    ).rejects.toThrow("not ready for approval");
    expect(state.revisions).toEqual([]);
    expect(state.audits).toEqual([]);

    state.criterion = baseCriterion();
    const approved = await approveAcceptanceCriterion(
      "initiative-a",
      "criterion-a",
      "user-a",
      { expectedRevision: 1, comment: "Reviewed with the Product Owner" },
    );
    expect(approved.approvedAt).toBeInstanceOf(Date);
    expect(approved).toMatchObject({ approvedByUserId: "user-a", backlogRevision: 2 });
    expect(state.revisions).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ action: "acceptance_criterion.approved" });
  });

  it("returns immutable history with the responsible user", async () => {
    await updateAcceptanceCriterion(
      "initiative-a",
      "criterion-a",
      {
        expectedRevision: 1,
        title: "Restore the complete view",
        reason: "Clarified the criterion title",
      },
      "user-a",
    );

    const history = await listAcceptanceCriterionHistory("initiative-a", "criterion-a");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      version: 1,
      title: "Restore saved filters",
      reason: "Clarified the criterion title",
      actor: { id: "user-a", name: "Avery" },
    });
  });
});
