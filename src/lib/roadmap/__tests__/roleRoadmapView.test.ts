import { describe, expect, it } from "vitest";
import {
  deriveProductRoadmapView,
  deriveProjectRoadmapView,
  deriveQuarterLabel,
  deriveRoleRoadmapView,
  projectPhaseThemes,
  type RoleRoadmapCapability,
  type RoleRoadmapInput,
} from "../roleRoadmapView";

function cap(overrides: Partial<RoleRoadmapCapability> = {}): RoleRoadmapCapability {
  return {
    id: "c1",
    name: "Checkout redesign",
    isMvp: true,
    businessValue: "medium",
    riskLevel: "medium",
    revenueImpactScore: null,
    estimatedCost: 1000,
    dependsOnNames: [],
    inOverAllocatedSprint: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<RoleRoadmapInput> = {}): RoleRoadmapInput {
  return {
    phases: [],
    cost: { estimatedInitiativeCost: 10000, budgetVariance: null, costHealth: "on_track" },
    scheduleHealth: "on_track",
    hasDependencyCycle: false,
    oversizedStoryCount: 0,
    tooBroadCapabilityCount: 0,
    milestones: [],
    ...overrides,
  };
}

describe("deriveQuarterLabel", () => {
  it("returns null for an unscheduled phase", () => {
    expect(deriveQuarterLabel([])).toBeNull();
  });

  it("derives the quarter from the earliest spanned sprint date", () => {
    expect(deriveQuarterLabel([new Date("2026-02-02"), new Date("2026-01-05")])).toBe("Q1 2026");
    expect(deriveQuarterLabel([new Date("2026-07-10")])).toBe("Q3 2026");
    expect(deriveQuarterLabel([new Date("2026-12-25")])).toBe("Q4 2026");
  });
});

describe("projectPhaseThemes", () => {
  it("maps phase 1 to Requirements/Design themes", () => {
    expect(projectPhaseThemes(1)).toEqual(["Requirements", "Design", "Vendor dependency"]);
  });

  it("maps phase 2 to Build themes", () => {
    expect(projectPhaseThemes(2)).toEqual(["Build", "Integration", "Testing"]);
  });

  it("maps phase 3 and beyond (agile_scrum's unbounded Later N windows) to UAT/Deployment themes", () => {
    expect(projectPhaseThemes(3)).toEqual(["UAT", "Deployment", "Go-Live"]);
    expect(projectPhaseThemes(4)).toEqual(["UAT", "Deployment", "Go-Live"]);
    expect(projectPhaseThemes(7)).toEqual(["UAT", "Deployment", "Go-Live"]);
  });
});

describe("deriveProductRoadmapView", () => {
  it("labels backlog readiness 'ready' when there are no warnings", () => {
    const view = deriveProductRoadmapView("product_management", baseInput());
    expect(view.backlogReadiness).toEqual({
      oversizedStoryCount: 0,
      tooBroadCapabilityCount: 0,
      label: "ready",
    });
  });

  it("labels backlog readiness 'needs_refinement' when oversized stories exist", () => {
    const view = deriveProductRoadmapView("product_owner", baseInput({ oversizedStoryCount: 2 }));
    expect(view.backlogReadiness.label).toBe("needs_refinement");
  });

  it("labels backlog readiness 'needs_refinement' when too-broad capabilities exist", () => {
    const view = deriveProductRoadmapView("product_owner", baseInput({ tooBroadCapabilityCount: 1 }));
    expect(view.backlogReadiness.label).toBe("needs_refinement");
  });

  it("carries the role-specific business value framing", () => {
    const pm = deriveProductRoadmapView("product_management", baseInput());
    const po = deriveProductRoadmapView("product_owner", baseInput());
    expect(pm.businessValueFraming.factors).toEqual(["Revenue impact", "Time to market"]);
    expect(po.businessValueFraming).toEqual(pm.businessValueFraming);
  });

  it("attaches a quarter label per phase from spanned sprint dates", () => {
    const view = deriveProductRoadmapView(
      "product_management",
      baseInput({
        phases: [
          { phaseNumber: 1, name: "Now", sprintStartDates: [new Date("2026-01-05")], capabilities: [cap()] },
          { phaseNumber: 2, name: "Next", sprintStartDates: [], capabilities: [] },
        ],
      }),
    );
    expect(view.phases[0].quarterLabel).toBe("Q1 2026");
    expect(view.phases[1].quarterLabel).toBeNull();
  });
});

describe("deriveProjectRoadmapView", () => {
  it("attaches SDLC themes per phase", () => {
    const view = deriveProjectRoadmapView(
      baseInput({
        phases: [
          { phaseNumber: 1, name: "Phase 1 — MVP", sprintStartDates: [], capabilities: [] },
          { phaseNumber: 2, name: "Phase 2 — Fast Follow", sprintStartDates: [], capabilities: [] },
        ],
      }),
    );
    expect(view.phases[0].themes).toEqual(["Requirements", "Design", "Vendor dependency"]);
    expect(view.phases[1].themes).toEqual(["Build", "Integration", "Testing"]);
  });

  it("passes cost and milestones straight through without recomputation", () => {
    const cost = { estimatedInitiativeCost: 54321, budgetVariance: { amount: 100, percent: 5 }, costHealth: "attention" as const };
    const milestones = [{ name: "Release 1 (MVP)", targetDate: new Date("2026-04-01"), phaseNumber: 1 }];
    const view = deriveProjectRoadmapView(baseInput({ cost, milestones }));
    expect(view.cost).toBe(cost);
    expect(view.milestones).toBe(milestones);
  });

  it("builds one sequencing sentence per dependency edge using the Project Manager phrasing", () => {
    const view = deriveProjectRoadmapView(
      baseInput({
        phases: [
          {
            phaseNumber: 1,
            name: "Phase 1 — MVP",
            sprintStartDates: [],
            capabilities: [cap({ name: "Activity B", dependsOnNames: ["Activity A"] })],
          },
        ],
      }),
    );
    expect(view.sequencingNotes).toEqual(["Activity B can't begin until Activity A is complete."]);
  });

  describe("SWOT heuristic", () => {
    it("Strengths: low/medium-risk MVP items not in an over-allocated sprint", () => {
      const view = deriveProjectRoadmapView(
        baseInput({
          phases: [{ phaseNumber: 1, name: "Phase 1", sprintStartDates: [], capabilities: [cap({ riskLevel: "low" })] }],
        }),
      );
      expect(view.swot.strengths).toHaveLength(1);
      expect(view.swot.weaknesses).toHaveLength(0);
    });

    it("Weaknesses: high/critical risk items", () => {
      const view = deriveProjectRoadmapView(
        baseInput({
          phases: [{ phaseNumber: 1, name: "Phase 1", sprintStartDates: [], capabilities: [cap({ riskLevel: "critical" })] }],
        }),
      );
      expect(view.swot.weaknesses).toHaveLength(1);
      expect(view.swot.strengths).toHaveLength(0);
    });

    it("Weaknesses: items in an over-allocated sprint, even if low risk", () => {
      const view = deriveProjectRoadmapView(
        baseInput({
          phases: [
            {
              phaseNumber: 1,
              name: "Phase 1",
              sprintStartDates: [],
              capabilities: [cap({ riskLevel: "low", inOverAllocatedSprint: true })],
            },
          ],
        }),
      );
      expect(view.swot.weaknesses).toHaveLength(1);
      expect(view.swot.strengths).toHaveLength(0);
    });

    it("Opportunities: non-MVP (phase >= 2) items with high/critical business value", () => {
      const view = deriveProjectRoadmapView(
        baseInput({
          phases: [
            {
              phaseNumber: 2,
              name: "Phase 2",
              sprintStartDates: [],
              capabilities: [cap({ isMvp: false, businessValue: "high" })],
            },
          ],
        }),
      );
      expect(view.swot.opportunities).toHaveLength(1);
    });

    it("Threats: dependency cycle, cost at risk, and schedule at risk each surface independently", () => {
      const view = deriveProjectRoadmapView(
        baseInput({
          hasDependencyCycle: true,
          cost: { estimatedInitiativeCost: 1, budgetVariance: null, costHealth: "at_risk" },
          scheduleHealth: "at_risk",
        }),
      );
      expect(view.swot.threats).toHaveLength(3);
    });

    it("is empty, not fabricated, when nothing warrants a bucket", () => {
      const view = deriveProjectRoadmapView(baseInput());
      expect(view.swot).toEqual({ strengths: [], weaknesses: [], opportunities: [], threats: [] });
    });
  });
});

describe("deriveRoleRoadmapView", () => {
  it("routes project_manager to the Project Roadmap view", () => {
    expect(deriveRoleRoadmapView("project_manager", baseInput()).kind).toBe("project");
  });

  it("routes product_owner to the Product Roadmap view with the product_owner role", () => {
    const view = deriveRoleRoadmapView("product_owner", baseInput());
    expect(view.kind).toBe("product");
    expect(view.kind === "product" && view.role).toBe("product_owner");
  });

  it("routes product_management to the Product Roadmap view", () => {
    const view = deriveRoleRoadmapView("product_management", baseInput());
    expect(view.kind).toBe("product");
    expect(view.kind === "product" && view.role).toBe("product_management");
  });

  it("falls back to product_management framing for a null/unset role", () => {
    const view = deriveRoleRoadmapView(null, baseInput());
    expect(view.kind).toBe("product");
    expect(view.kind === "product" && view.role).toBe("product_management");
  });
});
