import { afterEach, describe, expect, it } from "vitest";
import { estimateCostUsd, inputPricePerMillionTokens, outputPricePerMillionTokens } from "../pricing";

const ENV_KEYS = ["ANTHROPIC_INPUT_PRICE_PER_MILLION_USD", "ANTHROPIC_OUTPUT_PRICE_PER_MILLION_USD"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("estimateCostUsd", () => {
  it("computes cost from the default Sonnet-tier rates ($3/$15 per million)", () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(3, 6);
    expect(estimateCostUsd(0, 1_000_000)).toBeCloseTo(15, 6);
  });

  it("combines input and output cost", () => {
    expect(estimateCostUsd(500_000, 200_000)).toBeCloseTo(1.5 + 3, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });

  it("honors an env override for the rate", () => {
    process.env.ANTHROPIC_INPUT_PRICE_PER_MILLION_USD = "10";
    expect(inputPricePerMillionTokens()).toBe(10);
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(10, 6);
  });

  it("ignores an invalid env override and falls back to the default", () => {
    process.env.ANTHROPIC_OUTPUT_PRICE_PER_MILLION_USD = "not-a-number";
    expect(outputPricePerMillionTokens()).toBe(15);
  });
});
