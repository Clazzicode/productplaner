import { afterEach, describe, expect, it } from "vitest";
import {
  cacheReadPricePerMillionTokens,
  cacheWritePricePerMillionTokens,
  estimateCostUsd,
  inputPricePerMillionTokens,
  outputPricePerMillionTokens,
} from "../pricing";

const ENV_KEYS = [
  "ANTHROPIC_INPUT_PRICE_PER_MILLION_USD",
  "ANTHROPIC_OUTPUT_PRICE_PER_MILLION_USD",
  "ANTHROPIC_CACHE_WRITE_PRICE_PER_MILLION_USD",
  "ANTHROPIC_CACHE_READ_PRICE_PER_MILLION_USD",
] as const;

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

describe("cache-aware pricing (Section 5 §20/§21)", () => {
  it("defaults cache write/read rates to a multiple of the input rate (1.25x / 0.1x)", () => {
    expect(cacheWritePricePerMillionTokens()).toBeCloseTo(3 * 1.25, 6);
    expect(cacheReadPricePerMillionTokens()).toBeCloseTo(3 * 0.1, 6);
  });

  it("cache rates scale with an input-rate override, staying internally consistent", () => {
    process.env.ANTHROPIC_INPUT_PRICE_PER_MILLION_USD = "10";
    expect(cacheWritePricePerMillionTokens()).toBeCloseTo(12.5, 6);
    expect(cacheReadPricePerMillionTokens()).toBeCloseTo(1, 6);
  });

  it("an explicit cache-rate env override wins over the derived default", () => {
    process.env.ANTHROPIC_CACHE_READ_PRICE_PER_MILLION_USD = "0.5";
    expect(cacheReadPricePerMillionTokens()).toBe(0.5);
  });

  it("estimateCostUsd includes cache tokens when given, and defaults them to 0 for every pre-Section-5 call site", () => {
    expect(estimateCostUsd(0, 0, 1_000_000, 0)).toBeCloseTo(3 * 1.25, 6);
    expect(estimateCostUsd(0, 0, 0, 1_000_000)).toBeCloseTo(3 * 0.1, 6);
    // Backward compatible — omitting the two new params behaves exactly as before.
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(3, 6);
  });
});
