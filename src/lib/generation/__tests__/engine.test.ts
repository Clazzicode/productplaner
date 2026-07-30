import { describe, expect, it } from "vitest";
import { buildPlan, packSprints, partitionPhases } from "../buildPlan";
import { findCycle, orderByDependencyAndPriority } from "../dependencyGraph";
import { lockOrderViolation } from "../locking";
import { computeCapacityPoints, validateIntake } from "../validateIntake";
import type { CapabilityInput, IntakeInput } from "../types";

const cap = (over: Partial<CapabilityInput> & { id: string }): CapabilityInput => ({
  name: over.id,
  description: "",
  isMvp: true,
  effortSize: "m",
  businessValue: "high",
  order: 0,
  dependsOn: [],
  ...over,
});

const intake = (caps: CapabilityInput[], over?: Partial<IntakeInput>): IntakeInput => ({
  initiativeName: "Test Initiative",
  problemStatement: "Agents juggle five disconnected tools to answer one billing question.",
  targetCustomer: "billing support agents at mid-market SaaS companies",
  outcomeStatement: "agents resolve billing questions in one sitting",
  outcomeMetric: "median resolution under 10 minutes",
  teamSize: 5,
  sprintLengthWeeks: 2,
  velocityPerPersonPerSprint: 8,
  capacityBufferPercent: 20,
  startDate: new Date("2026-08-03T00:00:00Z"),
  capabilities: caps,
  ...over,
});

describe("capacity formula (FR-07)", () => {
  it("applies team size, velocity and buffer", () => {
    expect(
      computeCapacityPoints({ teamSize: 5, velocityPerPersonPerSprint: 8, capacityBufferPercent: 20 }),
    ).toBeCloseTo(32);
  });
});

describe("dependency graph", () => {
  it("detects cycles", () => {
    const caps = [
      cap({ id: "a", dependsOn: ["b"] }),
      cap({ id: "b", dependsOn: ["a"] }),
      cap({ id: "c" }),
    ];
    expect(findCycle(caps).sort()).toEqual(["a", "b"]);
    expect(findCycle([cap({ id: "x" }), cap({ id: "y", dependsOn: ["x"] })])).toEqual([]);
  });

  it("orders dependencies before dependents, then by value/effort", () => {
    const caps = [
      cap({ id: "low-value-dep", businessValue: "low", order: 0 }),
      cap({ id: "big-critical", businessValue: "critical", effortSize: "xl", order: 1, dependsOn: ["low-value-dep"] }),
      cap({ id: "small-critical", businessValue: "critical", effortSize: "s", order: 2 }),
    ];
    const ordered = orderByDependencyAndPriority(caps).map((c) => c.id);
    // small-critical wins on effort tie-break among available; the dependency
    // must still precede big-critical.
    expect(ordered.indexOf("low-value-dep")).toBeLessThan(ordered.indexOf("big-critical"));
    expect(ordered[0]).toBe("small-critical");
  });
});

describe("intake validation (FR-05)", () => {
  it("passes a clean intake", () => {
    const v = validateIntake(intake([cap({ id: "a" })]));
    expect(v.errors).toEqual([]);
  });

  it("blocks MVP capability depending on non-MVP", () => {
    const v = validateIntake(
      intake([cap({ id: "a", isMvp: true, dependsOn: ["b"] }), cap({ id: "b", isMvp: false })]),
    );
    expect(v.errors.some((e) => e.code === "mvp_depends_on_non_mvp")).toBe(true);
  });

  it("blocks cycles, empty capability lists and missing MVP scope", () => {
    expect(validateIntake(intake([])).errors.some((e) => e.code === "no_capabilities")).toBe(true);
    expect(
      validateIntake(intake([cap({ id: "a", isMvp: false })])).errors.some((e) => e.code === "no_mvp"),
    ).toBe(true);
    expect(
      validateIntake(
        intake([cap({ id: "a", dependsOn: ["b"] }), cap({ id: "b", dependsOn: ["a"] })]),
      ).errors.some((e) => e.code === "dependency_cycle"),
    ).toBe(true);
  });

  it("warns on oversized capabilities without blocking", () => {
    const v = validateIntake(
      intake([cap({ id: "a", effortSize: "xl" })], {
        teamSize: 1,
        velocityPerPersonPerSprint: 8,
        capacityBufferPercent: 20,
      }),
    );
    expect(v.errors).toEqual([]);
    expect(v.warnings.some((w) => w.code === "capability_exceeds_sprint")).toBe(true);
  });
});

describe("phase partitioning (Q4 + Q8)", () => {
  it("splits MVP / high-value / rest and promotes forward dependencies", () => {
    const caps = [
      cap({ id: "mvp" }),
      cap({ id: "fast-follow", isMvp: false, businessValue: "high" }),
      cap({ id: "later", isMvp: false, businessValue: "low" }),
      // fast-follow depends on "later" → later must be promoted into phase 2
      cap({ id: "fast-follow-2", isMvp: false, businessValue: "critical", dependsOn: ["later"] }),
    ];
    const phases = partitionPhases(caps);
    expect(phases.get(1)?.map((c) => c.id)).toEqual(["mvp"]);
    expect(new Set(phases.get(2)?.map((c) => c.id))).toEqual(
      new Set(["fast-follow", "fast-follow-2", "later"]),
    );
    expect(phases.get(3)).toBeUndefined();
  });
});

describe("sprint packing", () => {
  it("never exceeds capacity except for single oversized stories, and breaks at phase boundaries", () => {
    const stories = [
      { story: { points: 10, sprintNumber: 0 }, phaseNumber: 1 },
      { story: { points: 10, sprintNumber: 0 }, phaseNumber: 1 },
      { story: { points: 10, sprintNumber: 0 }, phaseNumber: 1 },
      { story: { points: 40, sprintNumber: 0 }, phaseNumber: 1 }, // oversized
      { story: { points: 5, sprintNumber: 0 }, phaseNumber: 2 }, // new phase
    ];
    const sprints = packSprints({
      stories,
      capacityPoints: 25,
      sprintLengthWeeks: 2,
      startDate: new Date("2026-08-03T00:00:00Z"),
    });
    // Sprint 1: 10+10 = 20; sprint 2: 10; oversized 40 gets its own sprint 3;
    // phase 2 story forces sprint 4.
    expect(sprints.map((s) => s.plannedPoints)).toEqual([20, 10, 40, 5]);
    expect(sprints.map((s) => s.phaseNumber)).toEqual([1, 1, 1, 2]);
    const phase1Numbers = stories.filter((s) => s.phaseNumber === 1).map((s) => s.story.sprintNumber);
    expect(Math.max(...phase1Numbers)).toBeLessThan(stories[4].story.sprintNumber);
  });
});

describe("full plan build (FR-08/FR-09)", () => {
  const caps = [
    cap({ id: "auth", name: "Account login", effortSize: "m", businessValue: "critical" }),
    cap({ id: "import", name: "Bulk import", effortSize: "l", businessValue: "high", dependsOn: ["auth"] }),
    cap({ id: "reports", name: "Reporting", isMvp: false, businessValue: "high", effortSize: "m" }),
    cap({ id: "themes", name: "Custom themes", isMvp: false, businessValue: "low", effortSize: "s" }),
  ];

  it("produces the connected chain with stable structure", () => {
    const plan = buildPlan(intake(caps));
    expect(plan.phases.map((p) => p.phaseNumber)).toEqual([1, 2, 3]);
    // effort m → 2 epics × 3 stories; l → 3 epics × 3 stories; s → 1 epic × 2 stories
    const phase1 = plan.phases[0];
    expect(phase1.features.map((f) => f.title)).toEqual(["Account login", "Bulk import"]);
    expect(phase1.features[0].epics).toHaveLength(2);
    expect(phase1.features[1].epics).toHaveLength(3);
    for (const feature of plan.phases.flatMap((p) => p.features)) {
      for (const epic of feature.epics) {
        for (const story of epic.stories) {
          expect(story.acs).toHaveLength(3);
          expect(story.sprintNumber).toBeGreaterThan(0);
          expect(story.body).toContain("billing support agents");
        }
      }
    }
  });

  it("is deterministic", () => {
    const a = JSON.stringify(buildPlan(intake(caps)));
    const b = JSON.stringify(buildPlan(intake(caps)));
    expect(a).toBe(b);
  });

  it("cuts releases exactly at phase boundaries", () => {
    const plan = buildPlan(intake(caps));
    for (const release of plan.releases) {
      const phaseSprints = plan.sprints.filter((s) => s.phaseNumber === release.phaseNumber);
      expect(release.targetDate.getTime()).toBe(
        phaseSprints[phaseSprints.length - 1].endDate.getTime(),
      );
    }
    const phaseOfSprint = new Map(plan.sprints.map((s) => [s.sprintNumber, s.phaseNumber]));
    for (const phase of plan.phases) {
      for (const feature of phase.features) {
        for (const epic of feature.epics) {
          for (const story of epic.stories) {
            expect(phaseOfSprint.get(story.sprintNumber)).toBe(phase.phaseNumber);
          }
        }
      }
    }
  });
});

describe("lock ordering (FR-12)", () => {
  const locks = (lockedUpTo: number) =>
    ["roadmap", "feature_hierarchy", "epics", "stories", "acceptance_criteria"].map((t, i) => ({
      layerType: t,
      state: i < lockedUpTo ? "locked" : "unlocked",
    }));

  it("allows the first layer any time and rejects skipping", () => {
    expect(lockOrderViolation(locks(0), "roadmap")).toBeNull();
    expect(lockOrderViolation(locks(0), "epics")).toMatch(/Feature Hierarchy/);
    expect(lockOrderViolation(locks(1), "feature_hierarchy")).toBeNull();
    expect(lockOrderViolation(locks(1), "stories")).toMatch(/Epics/);
    expect(lockOrderViolation(locks(4), "acceptance_criteria")).toBeNull();
  });
});
