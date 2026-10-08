import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAiPricingConfigured, cacheReadPricePerMillionTokens, cacheWritePricePerMillionTokens,
  estimateCostUsd, inputPricePerMillionTokens, outputPricePerMillionTokens,
} from "../pricing";
const KEYS = ["OPENAI_MODEL", ...["INPUT", "OUTPUT", "CACHE_WRITE", "CACHE_READ"].map(
  kind => "OPENAI_" + kind + "_PRICE_PER_MILLION_USD",
)];
beforeEach(() => { for (const key of KEYS) vi.stubEnv(key, undefined); });
afterEach(() => vi.unstubAllEnvs());
describe("OpenAI usage estimates", () => {
  it("uses Standard GPT-6 Sol rates for distinct token categories", () => {
    expect(inputPricePerMillionTokens()).toBe(2);
    expect(outputPricePerMillionTokens()).toBe(10);
    expect(cacheWritePricePerMillionTokens()).toBe(2.5);
    expect(cacheReadPricePerMillionTokens()).toBe(0.2);
    expect(estimateCostUsd(500_000, 200_000, 100_000, 100_000)).toBe(3.27);
  });
  it("does not reprice zero-cost reuse or failures with no reported tokens", () => {
    vi.stubEnv("OPENAI_MODEL", "unknown");
    expect(estimateCostUsd(0, 0)).toBe(0);
  });
  it("selects rates for a configured supported model", () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBe(0.6);
  });
  it.each(["bad", "-1", "Infinity"])("rejects invalid price %s instead of bypassing budget", value => {
    vi.stubEnv("OPENAI_OUTPUT_PRICE_PER_MILLION_USD", value);
    expect(assertAiPricingConfigured).toThrow("Invalid OPENAI_OUTPUT");
  });
  it("requires all four prices for an unknown model", () => {
    vi.stubEnv("OPENAI_MODEL", "custom-model");
    expect(assertAiPricingConfigured).toThrow("Configure OpenAI");
    vi.stubEnv("OPENAI_INPUT_PRICE_PER_MILLION_USD", "4");
    vi.stubEnv("OPENAI_OUTPUT_PRICE_PER_MILLION_USD", "20");
    expect(assertAiPricingConfigured).toThrow("Configure OpenAI");
    vi.stubEnv("OPENAI_CACHE_WRITE_PRICE_PER_MILLION_USD", "0");
    vi.stubEnv("OPENAI_CACHE_READ_PRICE_PER_MILLION_USD", "1");
    expect(assertAiPricingConfigured).not.toThrow();
    expect(estimateCostUsd(1_000_000, 1_000_000, 1_000_000, 1_000_000)).toBe(25);
  });
});
