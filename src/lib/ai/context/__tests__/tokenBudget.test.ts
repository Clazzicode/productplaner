import { describe, expect, it } from "vitest";
import { estimateTokens, trimToBudget } from "../tokenBudget";
import type { ContextTier } from "../types";

function tier(overrides: Partial<ContextTier>): ContextTier {
  return {
    layer: "project",
    priority: 10,
    required: false,
    label: "Tier",
    content: "x",
    sourceType: "Test",
    sourceId: "id-1",
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("is a documented ~4 chars/token approximation", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("rounds up for a partial token", () => {
    expect(estimateTokens("abc")).toBe(1);
  });
});

describe("trimToBudget", () => {
  it("keeps every tier when everything fits", () => {
    const tiers = [tier({ label: "a", content: "short" }), tier({ label: "b", content: "also short" })];
    const result = trimToBudget(tiers, 10_000);
    expect(result.overBudget).toBe(false);
    expect(result.tiers).toHaveLength(2);
    expect(result.trimmedLayers).toHaveLength(0);
  });

  it("drops the lowest-priority optional tier first", () => {
    const low = tier({ label: "low-priority", priority: 1, content: "x".repeat(400) });
    const high = tier({ label: "high-priority", priority: 100, content: "x".repeat(400) });
    // Budget fits exactly one of the two ~100-token tiers.
    const result = trimToBudget([low, high], 120);
    expect(result.tiers.map((t) => t.label)).toEqual(["high-priority"]);
    expect(result.trimmedLayers).toContain("project");
  });

  it("never drops a required tier, regardless of priority", () => {
    const requiredLowPriority = tier({ label: "required", priority: 1, required: true, content: "x".repeat(400) });
    const optionalHighPriority = tier({ label: "optional", priority: 100, content: "x".repeat(400) });
    const result = trimToBudget([requiredLowPriority, optionalHighPriority], 120);
    expect(result.tiers.map((t) => t.label)).toContain("required");
    expect(result.overBudget).toBe(false);
  });

  it("every 'task' layer tier is expected to be marked required by its caller — verify the required flag, not the layer name, is what protects it", () => {
    const taskButNotRequired = tier({ label: "task-ish", layer: "task", required: false, priority: 1, content: "x".repeat(400) });
    const optionalHighPriority = tier({ label: "optional", priority: 100, content: "x".repeat(400) });
    const result = trimToBudget([taskButNotRequired, optionalHighPriority], 120);
    // Confirms trimToBudget itself is purely required-flag-driven — callers
    // (assembleContext.ts) are responsible for always marking task tiers required.
    expect(result.tiers.map((t) => t.label)).toEqual(["optional"]);
  });

  it("returns overBudget:true with required tiers UNTOUCHED when required content alone exceeds the budget — never silently truncated", () => {
    const required1 = tier({ label: "required-1", required: true, content: "x".repeat(400) });
    const required2 = tier({ label: "required-2", required: true, content: "x".repeat(400) });
    const optional = tier({ label: "optional", content: "x".repeat(400) });
    const result = trimToBudget([required1, required2, optional], 50);
    expect(result.overBudget).toBe(true);
    expect(result.tiers).toEqual([required1, required2]);
    expect(result.tiers.some((t) => t.label === "optional")).toBe(false);
  });

  it("preserves original tier order among the tiers that are kept", () => {
    const a = tier({ label: "a", priority: 5, content: "short" });
    const b = tier({ label: "b", priority: 10, content: "short" });
    const c = tier({ label: "c", priority: 1, content: "short" });
    const result = trimToBudget([a, b, c], 10_000);
    expect(result.tiers.map((t) => t.label)).toEqual(["a", "b", "c"]);
  });
});
