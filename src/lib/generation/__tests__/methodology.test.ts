import { describe, expect, it } from "vitest";
import {
  packContinuousFlow,
  partitionPhasesContinuousBacklog,
} from "../buildPlan";
import { lockOrderViolation } from "../locking";
import { METHODOLOGY_PROFILES, profileFor, resolveMethodology } from "../methodology";
import type { CapabilityInput } from "../types";

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

describe("resolveMethodology / profileFor", () => {
  it("passes through known methodologies", () => {
    expect(resolveMethodology("agile_scrum")).toBe("agile_scrum");
    expect(resolveMethodology("waterfall")).toBe("waterfall");
    expect(resolveMethodology("kanban")).toBe("kanban");
    expect(resolveMethodology("hybrid")).toBe("hybrid");
  });

  it("collapses not_sure, null, undefined, and anything unrecognized to hybrid", () => {
    expect(resolveMethodology("not_sure")).toBe("hybrid");
    expect(resolveMethodology(null)).toBe("hybrid");
    expect(resolveMethodology(undefined)).toBe("hybrid");
    expect(resolveMethodology("garbage")).toBe("hybrid");
  });

  it("profileFor returns the matching profile", () => {
    expect(profileFor("kanban")).toBe(METHODOLOGY_PROFILES.kanban);
    expect(profileFor(undefined)).toBe(METHODOLOGY_PROFILES.hybrid);
  });
});

describe("partitionPhasesContinuousBacklog (Agile/Scrum roadmap mode)", () => {
  it("chunks the whole set into rolling windows regardless of MVP flag", () => {
    const caps = [
      cap({ id: "a", isMvp: true, order: 0 }),
      cap({ id: "b", isMvp: false, businessValue: "low", order: 1 }),
      cap({ id: "c", isMvp: false, businessValue: "low", order: 2 }),
      cap({ id: "d", isMvp: false, businessValue: "low", order: 3 }),
    ];
    const phases = partitionPhasesContinuousBacklog(caps, 3);
    expect(phases.size).toBe(2);
    expect(phases.get(1)?.length).toBe(3);
    expect(phases.get(2)?.length).toBe(1);
  });

  it("never places a dependency in a later window than its dependent", () => {
    const caps = [
      cap({ id: "low-value-dep", businessValue: "low", order: 0 }),
      cap({ id: "big-critical", businessValue: "critical", order: 1, dependsOn: ["low-value-dep"] }),
      cap({ id: "small-critical", businessValue: "critical", order: 2 }),
      cap({ id: "medium", businessValue: "medium", order: 3 }),
    ];
    const phases = partitionPhasesContinuousBacklog(caps, 3);
    const windowOf = new Map<string, number>();
    for (const [window, members] of phases) {
      for (const m of members) windowOf.set(m.id, window);
    }
    expect(windowOf.get("low-value-dep")!).toBeLessThanOrEqual(windowOf.get("big-critical")!);
  });
});

describe("packContinuousFlow (Kanban sprint mode)", () => {
  it("derives release dates from cumulative throughput, not sprint boundaries", () => {
    const startDate = new Date("2026-08-03T00:00:00Z");
    // capacity 10 pts, 2-week sprint length -> throughput 5 pts/week
    const result = packContinuousFlow({
      stories: [
        { story: { points: 10, sprintNumber: 0 }, phaseNumber: 1 },
        { story: { points: 5, sprintNumber: 0 }, phaseNumber: 1 },
        { story: { points: 5, sprintNumber: 0 }, phaseNumber: 2 },
      ],
      capacityPoints: 10,
      sprintLengthWeeks: 2,
      startDate,
    });
    expect(result.throughputPerWeek).toBe(5);
    // Phase 1: 15 cumulative points / 5 per week = 3 weeks after start.
    const phase1 = result.phaseDateRanges.get(1)!;
    expect(phase1.startDate.getTime()).toBe(startDate.getTime());
    expect(phase1.endDate.getTime()).toBe(startDate.getTime() + 3 * 7 * 24 * 60 * 60 * 1000);
    expect(result.releaseDateByPhase.get(1)!.getTime()).toBe(phase1.endDate.getTime());
    // Phase 2: starts where phase 1 left off (15 pts), ends at 20 pts -> 4 weeks.
    const phase2 = result.phaseDateRanges.get(2)!;
    expect(phase2.startDate.getTime()).toBe(phase1.endDate.getTime());
    expect(phase2.endDate.getTime()).toBe(startDate.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
  });

  it("produces no phases for an empty story list", () => {
    const result = packContinuousFlow({
      stories: [],
      capacityPoints: 10,
      sprintLengthWeeks: 2,
      startDate: new Date(),
    });
    expect(result.phaseDateRanges.size).toBe(0);
    expect(result.releaseDateByPhase.size).toBe(0);
  });
});

describe("lockOrderViolation with methodology", () => {
  const locks = (lockedUpTo: number) =>
    ["roadmap", "feature_hierarchy", "epics", "stories", "acceptance_criteria"].map((t, i) => ({
      layerType: t,
      state: i < lockedUpTo ? "locked" : "unlocked",
    }));

  it("defaults to hybrid's strict sequence when methodology is omitted", () => {
    expect(lockOrderViolation(locks(0), "epics")).toMatch(/Feature Hierarchy/);
  });

  it("enforces strict sequence for waterfall and kanban explicitly", () => {
    expect(lockOrderViolation(locks(0), "epics", "waterfall")).toMatch(/Feature Hierarchy/);
    expect(lockOrderViolation(locks(0), "epics", "kanban")).toMatch(/Feature Hierarchy/);
  });

  it("allows any lock order for agile_scrum", () => {
    expect(lockOrderViolation(locks(0), "epics", "agile_scrum")).toBeNull();
    expect(lockOrderViolation(locks(0), "acceptance_criteria", "agile_scrum")).toBeNull();
  });
});
