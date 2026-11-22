import { describe, expect, it } from "vitest";
import { buildTourSteps } from "../CoachMarkProvider";

describe("buildTourSteps", () => {
  it("drops the three initiative-scoped keys when there is no generated initiative yet", () => {
    const steps = buildTourSteps(null);
    expect(steps.map((s) => s.key)).toEqual(["projects", "initiatives", "integrations"]);
  });

  it("includes all six keys, in COACH_MARK_KEYS order, once an initiative is generated", () => {
    const steps = buildTourSteps("init-1");
    expect(steps.map((s) => s.key)).toEqual([
      "projects",
      "initiatives",
      "roadmap",
      "planning_workspace",
      "sprints_releases",
      "integrations",
    ]);
  });

  it("routes each initiative-scoped step to that specific initiative's sub-page", () => {
    const steps = buildTourSteps("init-42");
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.href]));
    expect(byKey.roadmap).toBe("/initiatives/init-42/workspace/roadmap");
    expect(byKey.planning_workspace).toBe("/initiatives/init-42/workspace/features");
    expect(byKey.sprints_releases).toBe("/initiatives/init-42/workspace/sprints");
  });

  it("routes the always-reachable steps regardless of initiative state", () => {
    const steps = buildTourSteps(null);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.href]));
    expect(byKey.projects).toBe("/projects");
    expect(byKey.initiatives).toBe("/initiatives");
    expect(byKey.integrations).toBe("/integrations");
  });
});
