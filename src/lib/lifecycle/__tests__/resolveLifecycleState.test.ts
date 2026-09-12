import { describe, expect, it } from "vitest";
import { resolveLifecycleState, type LifecycleInput } from "../resolveLifecycleState";

const base: LifecycleInput = {
  initiative: null,
  roadmapLocked: false,
  manualReleaseCount: 0,
  manualSprintCount: 0,
};

describe("resolveLifecycleState", () => {
  it("no_initiative when the user has no initiative yet", () => {
    const result = resolveLifecycleState(base);
    expect(result.stage).toBe("no_initiative");
    expect(result.nextAction.key).toBe("CREATE_INITIATIVE");
  });

  it("initiative_no_plan when the initiative hasn't been generated", () => {
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "intake_in_progress" },
    });
    expect(result.stage).toBe("initiative_no_plan");
    expect(result.nextAction).toEqual({
      key: "GENERATE_PLAN",
      label: "Generate Plan",
      href: "/initiatives/init-1/intake",
    });
  });

  it("plan_not_reviewed when generated but the roadmap isn't locked", () => {
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "generated" },
      roadmapLocked: false,
    });
    expect(result.stage).toBe("plan_not_reviewed");
    expect(result.nextAction.key).toBe("REVIEW_ROADMAP");
  });

  it("roadmap_reviewed_no_release once locked but no manual release exists", () => {
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "generated" },
      roadmapLocked: true,
      manualReleaseCount: 0,
    });
    expect(result.stage).toBe("roadmap_reviewed_no_release");
    expect(result.nextAction.key).toBe("CREATE_RELEASE");
  });

  it("release_no_sprint once a manual release exists but no manual sprint does", () => {
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "generated" },
      roadmapLocked: true,
      manualReleaseCount: 1,
      manualSprintCount: 0,
    });
    expect(result.stage).toBe("release_no_sprint");
    expect(result.nextAction.key).toBe("CREATE_SPRINT");
  });

  it("active_execution once a manual release and sprint both exist", () => {
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "generated" },
      roadmapLocked: true,
      manualReleaseCount: 1,
      manualSprintCount: 1,
    });
    expect(result.stage).toBe("active_execution");
    expect(result.nextAction.key).toBe("OPERATIONAL_DASHBOARD");
  });

  it("ignores pre-existing auto-origin releases/sprints — only manual counts satisfy the gate", () => {
    // Retroactive gating (reference doc decision): a prototype generated
    // before this restructure may have plenty of engine-auto-packed
    // Release/Sprint rows, but callers must pass manualReleaseCount/
    // manualSprintCount already filtered to origin:"manual" — the resolver
    // itself has no way to "cheat" and count auto rows, by construction.
    const result = resolveLifecycleState({
      ...base,
      initiative: { id: "init-1", status: "generated" },
      roadmapLocked: true,
      manualReleaseCount: 0,
      manualSprintCount: 0,
    });
    expect(result.stage).toBe("roadmap_reviewed_no_release");
  });
});
