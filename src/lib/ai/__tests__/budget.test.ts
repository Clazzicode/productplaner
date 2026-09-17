import { afterEach, describe, expect, it } from "vitest";
import { getPlatformAiMonthlyBudgetUsd, resolveDefaultOrgSharePercent, usageWarningLevel } from "../budget";

afterEach(() => {
  delete process.env.PLATFORM_AI_MONTHLY_BUDGET_USD;
  delete process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT;
});

describe("getPlatformAiMonthlyBudgetUsd", () => {
  it("returns null when unset — no platform budget configured", () => {
    expect(getPlatformAiMonthlyBudgetUsd()).toBeNull();
  });

  it("returns the configured value", () => {
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "5000";
    expect(getPlatformAiMonthlyBudgetUsd()).toBe(5000);
  });

  it("rejects a zero or negative value", () => {
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "0";
    expect(getPlatformAiMonthlyBudgetUsd()).toBeNull();
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "-10";
    expect(getPlatformAiMonthlyBudgetUsd()).toBeNull();
  });

  it("rejects a non-numeric value", () => {
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "not-a-number";
    expect(getPlatformAiMonthlyBudgetUsd()).toBeNull();
  });
});

describe("usageWarningLevel", () => {
  it("is null below 70%", () => {
    expect(usageWarningLevel(0)).toBeNull();
    expect(usageWarningLevel(69.9)).toBeNull();
  });

  it("is '70' from 70% up to (not including) 90%", () => {
    expect(usageWarningLevel(70)).toBe("70");
    expect(usageWarningLevel(80)).toBe("70");
    expect(usageWarningLevel(89.9)).toBe("70");
  });

  it("is '90' from 90% up to (not including) 100%", () => {
    expect(usageWarningLevel(90)).toBe("90");
    expect(usageWarningLevel(99.9)).toBe("90");
  });

  it("is '100' at or above 100%", () => {
    expect(usageWarningLevel(100)).toBe("100");
    expect(usageWarningLevel(150)).toBe("100");
  });
});

describe("resolveDefaultOrgSharePercent (Section 5 §27 — the 4% default made configurable)", () => {
  it("returns the documented 4% default when unset", () => {
    expect(resolveDefaultOrgSharePercent()).toBe(4);
  });

  it("returns a configured value", () => {
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "10";
    expect(resolveDefaultOrgSharePercent()).toBe(10);
  });

  it("accepts the boundaries 0 and 100", () => {
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "0";
    expect(resolveDefaultOrgSharePercent()).toBe(0);
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "100";
    expect(resolveDefaultOrgSharePercent()).toBe(100);
  });

  it("falls back to the default for an out-of-range or non-numeric value", () => {
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "150";
    expect(resolveDefaultOrgSharePercent()).toBe(4);
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "-5";
    expect(resolveDefaultOrgSharePercent()).toBe(4);
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "not-a-number";
    expect(resolveDefaultOrgSharePercent()).toBe(4);
  });
});
