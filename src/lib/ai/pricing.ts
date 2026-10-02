// OpenAI Standard short-context rates, verified 2026-09-26:
// https://developers.openai.com/api/docs/pricing
// Historical usage rows keep their recorded cost and are never repriced.
const RATES: Record<string, { input: number; output: number }> = {
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
};
function configuredRate(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
}
function rate(kind: "input" | "output"): number {
  const override = configuredRate(`OPENAI_${kind.toUpperCase()}_PRICE_PER_MILLION_USD`);
  if (override !== undefined) return override;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-sol";
  const defaults = RATES[model];
  if (!defaults) throw new Error("Configure OpenAI input/output/cache prices for this model before enabling AI.");
  return defaults[kind];
}
export function inputPricePerMillionTokens(): number { return rate("input"); }
export function outputPricePerMillionTokens(): number { return rate("output"); }
export function cacheWritePricePerMillionTokens(): number {
  return configuredRate("OPENAI_CACHE_WRITE_PRICE_PER_MILLION_USD") ?? defaultCacheRate(1.25);
}
export function cacheReadPricePerMillionTokens(): number {
  return configuredRate("OPENAI_CACHE_READ_PRICE_PER_MILLION_USD") ?? defaultCacheRate(0.1);
}
function defaultCacheRate(multiplier: number): number {
  if (!RATES[process.env.OPENAI_MODEL?.trim() || "gpt-6-sol"]) {
    throw new Error("Configure OpenAI input/output/cache prices for this model before enabling AI.");
  }
  return rate("input") * multiplier;
}
export function assertAiPricingConfigured(): void {
  inputPricePerMillionTokens(); outputPricePerMillionTokens();
  cacheWritePricePerMillionTokens(); cacheReadPricePerMillionTokens();
}
export function estimateCostUsd(inputTokens: number, outputTokens: number, cacheCreationInputTokens = 0, cacheReadInputTokens = 0): number {
  if (inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens === 0) return 0;
  const cost = inputTokens * inputPricePerMillionTokens() + outputTokens * outputPricePerMillionTokens()
    + cacheCreationInputTokens * cacheWritePricePerMillionTokens() + cacheReadInputTokens * cacheReadPricePerMillionTokens();
  return Math.round(cost) / 1_000_000;
}
