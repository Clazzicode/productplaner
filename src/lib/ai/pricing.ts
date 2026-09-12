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

/** Estimated cost in USD for one completed AI call — computed once at
 * record-time (src/lib/ai/usage.ts's recordAiUsage) and never recomputed
 * retroactively, so a historical event's cost stays accurate even if the
 * configured rate changes later. */
export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const cost =
    (inputTokens / 1_000_000) * inputPricePerMillionTokens() +
    (outputTokens / 1_000_000) * outputPricePerMillionTokens();
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places — fractions of a cent are real at this scale
}
