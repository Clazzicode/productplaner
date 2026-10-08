import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  finding: {} as Record<string, unknown>,
  revisions: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  memberExists: true,
}));

function baseFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-a",
    organizationId: "org-a",
    initiativeId: "initiative-a",
    storyId: "story-a",
    sourceType: "manual",
    category: "engineering_question",
    title: "Clarify retry behavior",
    detail: "What should happen when the provider is unavailable?",
    status: "open",
    revision: 1,
    dedupeKey: "manual:story-a:engineering_question:clarify retry behavior",
    ownerUserId: null,
    resolution: "",
    followUpNote: "Ask engineering during refinement.",
    followUpAt: null,
    resolvedAt: null,
    story: { id: "story-a", type: "story" },
    ...overrides,
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    refinementFinding: {
      findUnique: vi.fn(async () => structuredClone(state.finding)),
      findUniqueOrThrow: vi.fn(async () => structuredClone(state.finding)),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; revision: number };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== state.finding.id || where.revision !== state.finding.revision) {
          return { count: 0 };
        }
        const increment = (data.revision as { increment: number }).increment;
        state.finding = {
          ...state.finding,
          ...data,
          revision: Number(state.finding.revision) + increment,
        };
        return { count: 1 };
      }),
    },
    refinementFindingRevision: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `revision-${state.revisions.length + 1}`,
          createdAt: new Date("2026-10-08T13:00:00Z"),
          actorUser: { id: "user-a", name: "Avery", email: "avery@example.com" },
          ...data,
        };
        state.revisions.push(row);
        return row;
      }),
      findMany: vi.fn(async () => structuredClone(state.revisions).reverse()),
    },
    organizationMember: {
      findFirst: vi.fn(async () => state.memberExists ? { id: "membership-a" } : null),
    },
  },
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
      state.finding = snapshot.finding;
      state.revisions = snapshot.revisions;
      state.audits = snapshot.audits;
      state.memberExists = snapshot.memberExists;
      throw error;
    }
  }),
}));

import {
  detectCriterionConcerns,
  listRefinementFindingHistory,
  updateRefinementFinding,
} from "../service";

beforeEach(() => {
  state.finding = baseFinding();
  state.revisions = [];
  state.audits = [];
  state.memberExists = true;
});

describe("refinement finding lifecycle", () => {
  it("rejects stale changes without leaving history or audit records", async () => {
    await expect(updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 0,
        reason: "Editing an old copy",
        followUpNote: "Outdated follow-up",
      },
      "user-a",
    )).rejects.toThrow("changed");
    expect(state.finding).toMatchObject({ revision: 1, followUpNote: "Ask engineering during refinement." });
    expect(state.revisions).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("records ownership and follow-up changes as an immutable revision", async () => {
    const saved = await updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 1,
        reason: "Assigned for the next refinement session",
        ownerUserId: "user-owner",
        followUpNote: "Confirm retry count with engineering.",
        followUpAt: new Date("2026-10-15T12:00:00Z"),
      },
      "user-a",
    );
    expect(saved).toMatchObject({ ownerUserId: "user-owner", revision: 2 });
    expect(state.revisions[0]).toMatchObject({
      fromRevision: 1,
      toRevision: 2,
      reason: "Assigned for the next refinement session",
      actorUserId: "user-a",
    });
    expect(state.audits[0]).toMatchObject({ action: "refinement_finding.open" });
  });

  it("requires a valid organization member as owner", async () => {
    state.memberExists = false;
    await expect(updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 1,
        reason: "Assign the question",
        ownerUserId: "outsider",
      },
      "user-a",
    )).rejects.toThrow("active member");
    expect(state.revisions).toEqual([]);
  });

  it("requires a resolution and records a resolved lifecycle change", async () => {
    await expect(updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 1,
        reason: "Closing the question",
        status: "resolved",
        resolution: "",
      },
      "user-a",
    )).rejects.toThrow("resolution");

    const saved = await updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 1,
        reason: "Engineering confirmed the retry policy",
        status: "resolved",
        resolution: "Retry twice, then show a recoverable error.",
      },
      "user-a",
    );
    expect(saved).toMatchObject({ status: "resolved", revision: 2 });
    expect(saved.resolvedAt).toBeInstanceOf(Date);
    expect(state.audits[0]).toMatchObject({ action: "refinement_finding.resolved" });
  });

  it("returns history with the responsible user", async () => {
    await updateRefinementFinding(
      "finding-a",
      {
        expectedRevision: 1,
        reason: "Updated follow-up",
        followUpNote: "Review with the API team.",
      },
      "user-a",
    );
    const history = await listRefinementFindingHistory("finding-a");
    expect(history.revisions[0]).toMatchObject({
      toRevision: 2,
      reason: "Updated follow-up",
      actorUser: { name: "Avery" },
    });
  });
});

describe("deterministic refinement checks", () => {
  it("detects vague and conflicting acceptance criteria without AI", () => {
    const findings = detectCriterionConcerns({
      id: "story-a",
      children: [
        {
          title: "Success result",
          body: "Given a saved view, when I reopen it, then it works correctly.",
        },
        {
          title: "Show filters",
          body: "Given a saved view, when I reopen it, then every saved filter is displayed.",
        },
      ],
    });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "acceptance_criteria" }),
      expect.objectContaining({ category: "contradiction" }),
    ]));
  });
});
