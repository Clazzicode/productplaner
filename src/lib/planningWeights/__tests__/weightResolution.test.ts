import { describe, expect, it } from "vitest";
import { PRIORITY_WEIGHTS, VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";
import { isValidWeightSet, resolveWeightSet } from "../weightResolution";

describe("resolveWeightSet", () => {
  it("returns the registry defaults when there is no override", () => {
    expect(resolveWeightSet("valueFactorWeights", null)).toEqual(VALUE_FACTOR_WEIGHTS);
    expect(resolveWeightSet("valueFactorWeights", undefined)).toEqual(VALUE_FACTOR_WEIGHTS);
    expect(resolveWeightSet("priorityWeights", null)).toEqual(PRIORITY_WEIGHTS);
  });

  it("returns a valid, complete override", () => {
    const override = { customerImpact: 0.4, revenueImpact: 0.4, strategicAlignment: 0.1, riskCompliance: 0.1 };
    expect(resolveWeightSet("valueFactorWeights", JSON.stringify(override))).toEqual(override);
  });

  it("falls back to defaults for malformed JSON", () => {
    expect(resolveWeightSet("valueFactorWeights", "{not json")).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("falls back to defaults for a partial override (missing a key)", () => {
    const partial = { customerImpact: 0.4, revenueImpact: 0.6 };
    expect(resolveWeightSet("valueFactorWeights", JSON.stringify(partial))).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("falls back to defaults for an override with extra keys", () => {
    const extra = { customerImpact: 0.25, revenueImpact: 0.25, strategicAlignment: 0.25, riskCompliance: 0.2, extra: 0.05 };
    expect(resolveWeightSet("valueFactorWeights", JSON.stringify(extra))).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("falls back to defaults when the values don't sum to 1.0", () => {
    const bad = { customerImpact: 0.5, revenueImpact: 0.5, strategicAlignment: 0.5, riskCompliance: 0.5 };
    expect(resolveWeightSet("valueFactorWeights", JSON.stringify(bad))).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("falls back to defaults when a value is non-numeric", () => {
    const bad = { customerImpact: "0.3", revenueImpact: 0.3, strategicAlignment: 0.25, riskCompliance: 0.15 };
    expect(resolveWeightSet("valueFactorWeights", JSON.stringify(bad))).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("never partially applies a corrupt override", () => {
    const arrayJson = JSON.stringify([0.3, 0.3, 0.25, 0.15]);
    expect(resolveWeightSet("valueFactorWeights", arrayJson)).toEqual(VALUE_FACTOR_WEIGHTS);
  });
});

describe("isValidWeightSet", () => {
  it("accepts a complete set summing to exactly 1.0", () => {
    expect(isValidWeightSet("priorityWeights", PRIORITY_WEIGHTS)).toBe(true);
  });

  it("accepts a sum within tolerance of 1.0", () => {
    expect(
      isValidWeightSet("priorityWeights", { businessValue: 0.45, mvpImportance: 0.25, dependencyImportance: 0.15, riskReduction: 0.1501 }),
    ).toBe(true);
  });

  it("rejects a sum outside tolerance", () => {
    expect(
      isValidWeightSet("priorityWeights", { businessValue: 0.5, mvpImportance: 0.25, dependencyImportance: 0.15, riskReduction: 0.15 }),
    ).toBe(false);
  });

  it("rejects a missing key", () => {
    expect(isValidWeightSet("priorityWeights", { businessValue: 0.7, mvpImportance: 0.3, dependencyImportance: 0 })).toBe(false);
  });
});
