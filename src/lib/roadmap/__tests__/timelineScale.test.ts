import { describe, expect, it } from "vitest";
import { blockPosition, buildTimeAxis, PX_PER_DAY, todayOffset } from "../timelineScale";

// Local-time constructors throughout (not ISO date-only strings, which parse
// as UTC) — date-fns' startOfMonth/endOfMonth operate in local time, matching
// how the rest of this codebase already builds dates (e.g. engine.ts's
// nextMonday()). Mixing the two would make otherwise-correct math look wrong
// by a timezone offset.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("buildTimeAxis", () => {
  const today = d(2026, 6, 15);

  it("spans month-aligned bounds across Features scheduled in different phases", () => {
    // Phase 1 Feature ends in March, Phase 2 Feature starts in April — the axis
    // must cover both, proving zoom/grouping don't clip cross-phase data.
    const axis = buildTimeAxis({
      axisStart: d(2026, 1, 10),
      axisEnd: d(2026, 4, 20),
      zoom: "year",
      today,
    });
    expect(axis.rangeStart).toEqual(d(2026, 1, 1));
    expect(axis.rangeEnd.getMonth()).toBe(3); // April, month-end aligned
    expect(axis.months[0].label).toBe("Jan 2026");
    expect(axis.months.at(-1)!.label).toBe("Apr 2026");
  });

  it("pads a very short range to at least 3 months so the grid isn't degenerate", () => {
    const axis = buildTimeAxis({ axisStart: d(2026, 1, 5), axisEnd: d(2026, 1, 20), zoom: "year", today });
    expect(axis.months.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to anchoring on today when there's no scheduled data at all", () => {
    const axis = buildTimeAxis({ axisStart: null, axisEnd: null, zoom: "year", today });
    expect(axis.months.some((m) => m.key === "2026-06")).toBe(true);
  });

  it("quarter zoom uses a wider px-per-day than year zoom but covers the same range", () => {
    const args = { axisStart: d(2026, 1, 1), axisEnd: d(2026, 6, 30), today };
    const year = buildTimeAxis({ ...args, zoom: "year" });
    const quarter = buildTimeAxis({ ...args, zoom: "quarter" });
    expect(quarter.pxPerDay).toBeGreaterThan(year.pxPerDay);
    expect(quarter.pxPerDay).toBe(PX_PER_DAY.quarter);
    expect(quarter.months.length).toBe(year.months.length);
    expect(quarter.totalPx).toBeGreaterThan(year.totalPx);
  });

  it("gives every month a quarter key, grouping Jan-Mar and Apr-Jun separately", () => {
    const axis = buildTimeAxis({ axisStart: d(2026, 1, 1), axisEnd: d(2026, 6, 30), zoom: "year", today });
    const q1Months = axis.months.filter((m) => m.quarterKey === "2026-Q1").map((m) => m.key);
    const q2Months = axis.months.filter((m) => m.quarterKey === "2026-Q2").map((m) => m.key);
    expect(q1Months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(q2Months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(axis.months.find((m) => m.key === "2026-01")!.quarterLabel).toBe("Q1 2026");
  });
});

describe("blockPosition", () => {
  const axis = buildTimeAxis({ axisStart: d(2026, 1, 1), axisEnd: d(2026, 3, 31), zoom: "year", today: d(2026, 1, 1) });

  it("positions a block at day 0 with zero offset when it starts at the axis start", () => {
    const pos = blockPosition(axis, d(2026, 1, 1), d(2026, 1, 10));
    expect(pos.left).toBe(0);
  });

  it("width grows proportionally with duration", () => {
    const short = blockPosition(axis, d(2026, 2, 1), d(2026, 2, 10));
    const long = blockPosition(axis, d(2026, 2, 1), d(2026, 2, 28));
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("clamps a zero/near-zero duration block to a minimum readable width", () => {
    const pos = blockPosition(axis, d(2026, 2, 1), d(2026, 2, 1));
    expect(pos.width).toBeGreaterThanOrEqual(56);
  });
});

describe("todayOffset", () => {
  const axis = buildTimeAxis({ axisStart: d(2026, 1, 1), axisEnd: d(2026, 3, 31), zoom: "year", today: d(2026, 1, 1) });

  it("returns null when today falls outside the rendered axis", () => {
    expect(todayOffset(axis, d(2027, 1, 1))).toBeNull();
  });

  it("returns a positive offset when today falls inside the axis", () => {
    expect(todayOffset(axis, d(2026, 2, 1))).toBeGreaterThan(0);
  });
});
