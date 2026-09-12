import { afterEach, describe, expect, it } from "vitest";
import { getPlatformAiMonthlyBudgetUsd, usageWarningLevel } from "../budget";

afterEach(() => {
  delete process.env.PLATFORM_AI_MONTHLY_BUDGET_USD;
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
