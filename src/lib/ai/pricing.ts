// Published per-model token pricing — a technical/infrastructure fact, not
// an invented business rule (directive §28 distinguishes these: PM/PO/PM
// scoring methodology must never be fabricated, but Anthropic's own
// published API rates are a real, citable number). Defaults reflect the
// standard Sonnet-tier rate ($3/$15 per million input/output tokens), which
// has held across multiple Sonnet generations — override via env if
// Anthropic's published rate for the configured model differs; confirm
// against https://www.anthropic.com/pricing before relying on this for real
// billing, since a rate change here isn't automatic.

const DEFAULT_INPUT_PER_MILLION = 3;
const DEFAULT_OUTPUT_PER_MILLION = 15;
// Section 5 §20/§21 — Anthropic's published prompt-caching rates: a cache
// write (5-minute ephemeral TTL, what src/lib/ai/assist/runAction.ts uses)
// costs 1.25x the base input rate; a cache read costs 0.1x the base input
// rate. Both scale with inputPricePerMillionTokens() below rather than being
// separate flat defaults, so an input-rate override stays consistent with
// its cache rates automatically — confirm against
// https://www.anthropic.com/pricing before relying on this for real billing.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function inputPricePerMillionTokens(): number {
  return envFloat("ANTHROPIC_INPUT_PRICE_PER_MILLION_USD", DEFAULT_INPUT_PER_MILLION);
}

export function outputPricePerMillionTokens(): number {
  return envFloat("ANTHROPIC_OUTPUT_PRICE_PER_MILLION_USD", DEFAULT_OUTPUT_PER_MILLION);
}

export function cacheWritePricePerMillionTokens(): number {
  return envFloat("ANTHROPIC_CACHE_WRITE_PRICE_PER_MILLION_USD", inputPricePerMillionTokens() * CACHE_WRITE_MULTIPLIER);
}

export function cacheReadPricePerMillionTokens(): number {
  return envFloat("ANTHROPIC_CACHE_READ_PRICE_PER_MILLION_USD", inputPricePerMillionTokens() * CACHE_READ_MULTIPLIER);
}

/** Estimated cost in USD for one completed AI call — computed once at
 * record-time (src/lib/ai/usage.ts's recordAiUsage) and never recomputed
 * retroactively, so a historical event's cost stays accurate even if the
 * configured rate changes later. cacheCreationInputTokens/cacheReadInputTokens
 * default to 0, so every pre-Section-5 call site keeps working unchanged. */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens = 0,
  cacheReadInputTokens = 0,
): number {
  const cost =
    (inputTokens / 1_000_000) * inputPricePerMillionTokens() +
    (outputTokens / 1_000_000) * outputPricePerMillionTokens() +
    (cacheCreationInputTokens / 1_000_000) * cacheWritePricePerMillionTokens() +
    (cacheReadInputTokens / 1_000_000) * cacheReadPricePerMillionTokens();
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places — fractions of a cent are real at this scale
}
