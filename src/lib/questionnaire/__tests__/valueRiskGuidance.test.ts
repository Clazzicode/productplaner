import { describe, expect, it } from "vitest";
import {
  BUSINESS_VALUE_GUIDANCE,
  RISK_LEVEL_GUIDANCE,
  businessValueGuidance,
  riskLevelGuidance,
} from "../valueRiskGuidance";

const BUSINESS_VALUES = ["very_low", "low", "medium", "high", "critical"] as const;
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

describe("BUSINESS_VALUE_GUIDANCE", () => {
  it("has non-empty short and long text for every level", () => {
    for (const level of BUSINESS_VALUES) {
      const g = BUSINESS_VALUE_GUIDANCE[level];
      expect(g.short.length).toBeGreaterThan(0);
      expect(g.long.length).toBeGreaterThan(0);
      expect(g.long.length).toBeGreaterThan(g.short.length);
    }
  });
});

describe("RISK_LEVEL_GUIDANCE", () => {
  it("has non-empty short and long text for every level", () => {
    for (const level of RISK_LEVELS) {
      const g = RISK_LEVEL_GUIDANCE[level];
      expect(g.short.length).toBeGreaterThan(0);
      expect(g.long.length).toBeGreaterThan(0);
      expect(g.long.length).toBeGreaterThan(g.short.length);
    }
  });
});

describe("businessValueGuidance", () => {
  it("returns the short text when not verbose, the long text when verbose", () => {
    expect(businessValueGuidance("high", false)).toBe(BUSINESS_VALUE_GUIDANCE.high.short);
    expect(businessValueGuidance("high", true)).toBe(BUSINESS_VALUE_GUIDANCE.high.long);
  });
});

describe("riskLevelGuidance", () => {
  it("returns the short text when not verbose, the long text when verbose", () => {
    expect(riskLevelGuidance("critical", false)).toBe(RISK_LEVEL_GUIDANCE.critical.short);
    expect(riskLevelGuidance("critical", true)).toBe(RISK_LEVEL_GUIDANCE.critical.long);
  });
});
