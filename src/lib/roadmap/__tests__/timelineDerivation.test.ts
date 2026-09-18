import { describe, expect, it } from "vitest";
import { deriveFeatureHealth, deriveFeatureSchedule } from "../timelineDerivation";

describe("deriveFeatureSchedule", () => {
  it("a Feature with one Story/Sprint takes that sprint's exact span", () => {
    const result = deriveFeatureSchedule({
      spannedSprints: [{ startDate: new Date("2026-01-05"), endDate: new Date("2026-01-18") }],
      phaseRange: null,
      isContinuousFlow: false,
    });
    expect(result).toEqual({
      start: new Date("2026-01-05"),
      end: new Date("2026-01-18"),
      source: "sprints",
    });
  });

  it("a Feature spanning multiple Sprints takes the earliest start and latest end", () => {
    const result = deriveFeatureSchedule({
      spannedSprints: [
        { startDate: new Date("2026-02-02"), endDate: new Date("2026-02-15") },
        { startDate: new Date("2026-01-05"), endDate: new Date("2026-01-18") },
        { startDate: new Date("2026-03-02"), endDate: new Date("2026-03-15") },
      ],
      phaseRange: null,
      isContinuousFlow: false,
    });
    expect(result.start).toEqual(new Date("2026-01-05"));
    expect(result.end).toEqual(new Date("2026-03-15"));
    expect(result.source).toBe("sprints");
  });

  it("falls back to the phase's cached range only for Kanban (continuous_flow)", () => {
    const phaseRange = { start: new Date("2026-01-01"), end: new Date("2026-03-31") };
    const result = deriveFeatureSchedule({ spannedSprints: [], phaseRange, isContinuousFlow: true });
    expect(result).toEqual({ start: phaseRange.start, end: phaseRange.end, source: "phase_range" });
  });

  it("a non-Kanban Feature with no scheduled Stories is unscheduled, never fabricated", () => {
    const result = deriveFeatureSchedule({
      spannedSprints: [],
      phaseRange: { start: new Date("2026-01-01"), end: new Date("2026-03-31") },
      isContinuousFlow: false,
    });
    expect(result).toEqual({ start: null, end: null, source: "unscheduled" });
  });

  it("Kanban with no phase range yet is also unscheduled, not fabricated", () => {
    const result = deriveFeatureSchedule({ spannedSprints: [], phaseRange: null, isContinuousFlow: true });
    expect(result.source).toBe("unscheduled");
  });
});

describe("deriveFeatureHealth", () => {
  const today = new Date("2026-06-15");

  it("on_track / attention pass through scheduleHealth's existing thresholds unchanged", () => {
    expect(
      deriveFeatureHealth({ anyOverAllocated: false, featurePoints: 9, spannedCapacity: 10, end: null, today }),
    ).toBe("on_track");
    expect(
      deriveFeatureHealth({ anyOverAllocated: false, featurePoints: 10, spannedCapacity: 10, end: null, today }),
    ).toBe("attention");
  });

  it("over capacity but not yet due -> warning (orange, approaching issue)", () => {
    const end = new Date("2026-07-01"); // still in the future relative to `today`
    expect(
      deriveFeatureHealth({ anyOverAllocated: false, featurePoints: 15, spannedCapacity: 10, end, today }),
    ).toBe("warning");
  });

  it("over capacity and already past its derived end date -> critical (red, overdue)", () => {
    const end = new Date("2026-05-01"); // already in the past relative to `today`
    expect(
      deriveFeatureHealth({ anyOverAllocated: false, featurePoints: 15, spannedCapacity: 10, end, today }),
    ).toBe("critical");
  });

  it("an over-allocated spanned sprint forces the at-risk base even if this Feature's own ratio looks fine", () => {
    expect(
      deriveFeatureHealth({ anyOverAllocated: true, featurePoints: 2, spannedCapacity: 10, end: null, today }),
    ).toBe("warning");
  });

  it("no end date and over capacity defaults to warning, never fabricating an overdue state", () => {
    expect(
      deriveFeatureHealth({ anyOverAllocated: false, featurePoints: 20, spannedCapacity: 10, end: null, today }),
    ).toBe("warning");
  });
});
