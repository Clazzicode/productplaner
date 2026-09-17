import type { ContextLayer, ContextTier } from "./types";

// Section 5 §38/§39 — pure, DB-free token budgeting. No external tokenizer
// dependency anywhere in this codebase (src/lib/ai/pricing.ts already treats
// cost as an estimate, not a metered fact); this follows the same
// philosophy rather than adding a new dependency for a rough estimate.

/** A documented approximation (~4 chars/token, a commonly-cited English-text
 * ratio for Claude models) — not a precise count. Good enough to make
 * relative trimming decisions; never presented as an exact figure. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TrimResult {
  tiers: ContextTier[];
  trimmedLayers: ContextLayer[];
  overBudget: boolean;
}

/**
 * Drops the lowest-priority, non-required tiers first until the remaining
 * tiers fit within maxTokens. A `required: true` tier (an operation's
 * required layers, and always every "task"-layer tier — the current
 * operation's own task-specific information) is never dropped to fit the
 * budget — §38's "do not remove information required to correctly perform
 * the requested task" is a hard floor here, not a preference order.
 *
 * If the required tiers alone already exceed maxTokens, this does NOT
 * silently proceed over budget or guess which required fact to cut — it
 * returns `overBudget: true` with the required tiers untouched, and the
 * caller (assembleContext.ts) turns that into a stoppable error.
 */
export function trimToBudget(tiers: ContextTier[], maxTokens: number): TrimResult {
  const required = tiers.filter((t) => t.required);
  const optional = [...tiers.filter((t) => !t.required)].sort((a, b) => b.priority - a.priority);

  const requiredTokens = required.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  if (requiredTokens > maxTokens) {
    return { tiers: required, trimmedLayers: optional.map((t) => t.layer), overBudget: true };
  }

  const kept: ContextTier[] = [...required];
  const trimmedLayers: ContextLayer[] = [];
  let usedTokens = requiredTokens;

  for (const tier of optional) {
    const tierTokens = estimateTokens(tier.content);
    if (usedTokens + tierTokens <= maxTokens) {
      kept.push(tier);
      usedTokens += tierTokens;
    } else {
      trimmedLayers.push(tier.layer);
    }
  }

  // Restore original relative ordering (priority-sort above was only to
  // decide what to keep, not the tiers' final presentation order).
  const keptSet = new Set(kept);
  return { tiers: tiers.filter((t) => keptSet.has(t)), trimmedLayers, overBudget: false };
}
