import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  stories: vi.fn(), story: vi.fn(), bugs: vi.fn(), blockers: vi.fn(), dependencies: vi.fn(), singleObstacles: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    artifactLayer: { findMany: calls.stories, findFirst: calls.story },
    bugPlanningRecord: { findMany: calls.bugs },
    planningBlocker: { findMany: calls.blockers },
    workDependency: { findMany: calls.dependencies },
  },
  withTransaction: vi.fn(),
}));
vi.mock("@/lib/dependencies/service", () => ({ readinessObstacles: calls.singleObstacles }));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));

import { evaluateSprintReadiness, loadReadinessSnapshot } from "../service";

beforeEach(() => {
  vi.clearAllMocks();
  const stories = Array.from({ length: 126 }, (_, index) => ({
    id: `story-${index}`, title: `Story ${index}`, body: "A detailed outcome for the customer.",
    points: 3, children: [{ approvedAt: new Date("2026-01-01") }],
    sourceCapability: { ownerUserId: "owner", backlogLane: "now" },
    refinementSessionItems: [{ session: { status: "completed" } }],
  }));
  calls.stories.mockResolvedValue(stories);
  calls.story.mockResolvedValue(stories[0]);
  calls.bugs.mockResolvedValue([]);
  calls.blockers.mockResolvedValue([{ id: "blocker-1", description: "Open blocker", status: "open", storyId: "story-0", bugId: null }]);
  calls.dependencies.mockResolvedValue([{ id: "dependency-1", dependentStoryId: "story-0", dependentBugId: null }]);
  calls.singleObstacles.mockRejectedValue(new Error("Per-story obstacle query should not run"));
});

describe("sprint readiness page snapshot", () => {
  it("evaluates a 126-story initiative from four batched reads", async () => {
    const targets = Array.from({ length: 126 }, (_, index) => ({ type: "story" as const, id: `story-${index}` }));
    const snapshot = await loadReadinessSnapshot("initiative-1", targets);
    const evaluations = await Promise.all(targets.map((target) => evaluateSprintReadiness("initiative-1", target, snapshot)));

    expect([calls.stories, calls.bugs, calls.blockers, calls.dependencies].map((mock) => mock.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(calls.singleObstacles).not.toHaveBeenCalled();
    expect(evaluations).toHaveLength(126);
    expect(evaluations[0].checks.find((check) => check.checkKey === "blockers")?.status).toBe("fail");
    expect(evaluations[0].checks.find((check) => check.checkKey === "dependencies")?.status).toBe("review");
    expect(evaluations[1].recommendedDecision).toBe("ready");
  });

  it("keeps the same fingerprint as a single-item evaluation for an existing decision", async () => {
    const target = { type: "story" as const, id: "story-0" };
    const snapshot = await loadReadinessSnapshot("initiative-1", [target]);
    const fromBatch = await evaluateSprintReadiness("initiative-1", target, snapshot);
    calls.singleObstacles.mockResolvedValueOnce({
      blockers: [{ id: "blocker-1", description: "Open blocker", status: "open" }],
      dependencies: [{ id: "dependency-1", dependentStoryId: "story-0", dependentBugId: null }],
    });
    const single = await evaluateSprintReadiness("initiative-1", target);

    expect(fromBatch.inputFingerprint).toBe(single.inputFingerprint);
    expect(fromBatch.checks).toEqual(single.checks);
  });
});
