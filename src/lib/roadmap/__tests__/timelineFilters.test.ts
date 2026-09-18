import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterFeatures, isFilterActive, matchesFilters } from "../timelineFilters";

const feature = (over: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  isMvp: false,
  businessValue: "medium",
  riskLevel: "low",
  phaseNumber: 1,
  ...over,
});

describe("isFilterActive", () => {
  it("is false for the empty filter state", () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(isFilterActive({ ...EMPTY_FILTERS, mvpOnly: true })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, businessValue: "high" })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, riskLevel: "high" })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, phaseNumber: 2 })).toBe(true);
  });
});

describe("matchesFilters / filterFeatures", () => {
  it("MVP filter keeps only MVP features", () => {
    const filters = { ...EMPTY_FILTERS, mvpOnly: true };
    expect(matchesFilters(feature({ isMvp: true }), filters)).toBe(true);
    expect(matchesFilters(feature({ isMvp: false }), filters)).toBe(false);
  });

  it("value filter matches exact businessValue", () => {
    const filters = { ...EMPTY_FILTERS, businessValue: "critical" };
    expect(matchesFilters(feature({ businessValue: "critical" }), filters)).toBe(true);
    expect(matchesFilters(feature({ businessValue: "high" }), filters)).toBe(false);
  });

  it("risk filter matches exact riskLevel", () => {
    const filters = { ...EMPTY_FILTERS, riskLevel: "high" };
    expect(matchesFilters(feature({ riskLevel: "high" }), filters)).toBe(true);
    expect(matchesFilters(feature({ riskLevel: "low" }), filters)).toBe(false);
  });

  it("phase filter matches exact phaseNumber", () => {
    const filters = { ...EMPTY_FILTERS, phaseNumber: 2 };
    expect(matchesFilters(feature({ phaseNumber: 2 }), filters)).toBe(true);
    expect(matchesFilters(feature({ phaseNumber: 1 }), filters)).toBe(false);
  });

  it("combines multiple active filters with AND", () => {
    const filters = { ...EMPTY_FILTERS, mvpOnly: true, riskLevel: "high" };
    expect(matchesFilters(feature({ isMvp: true, riskLevel: "high" }), filters)).toBe(true);
    expect(matchesFilters(feature({ isMvp: true, riskLevel: "low" }), filters)).toBe(false);
    expect(matchesFilters(feature({ isMvp: false, riskLevel: "high" }), filters)).toBe(false);
  });

  it("filterFeatures narrows a list the same way, producing an empty array when nothing matches", () => {
    const list = [feature({ isMvp: true }), feature({ isMvp: false })];
    expect(filterFeatures(list, { ...EMPTY_FILTERS, mvpOnly: true })).toHaveLength(1);
    expect(filterFeatures(list, { ...EMPTY_FILTERS, businessValue: "critical" })).toHaveLength(0);
    expect(filterFeatures(list, EMPTY_FILTERS)).toHaveLength(2);
  });
});
