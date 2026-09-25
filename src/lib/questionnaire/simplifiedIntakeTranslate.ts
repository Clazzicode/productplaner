import { MIN_OUTCOME_CHARS } from "@/lib/generation/constants";

/**
 * Pure translation logic for the simplified (Beginner / Some Experience) 5-question
 * intake: turns the user's plain-language answers into the same shape the advanced
 * questionnaire produces (Initiative name/description, IntakeAnswerSet fields,
 * Capability[] drafts), so SimplifiedIntakeWizard can write through the existing
 * /api/initiatives, /intake, and /capabilities routes unchanged, and the existing
 * generation engine (src/lib/generation/*) never needs to know which flow a plan
 * came from. No React/DOM/fetch here — pure functions only.
 */

const MAX_PARSED_ITEMS = 25;
const MIN_ITEM_CHARS = 3;

/** Newline-first, comma/semicolon fallback for single-line input. Strips leading
 * bullet/number markers ("- ", "* ", "1. ", "2) "), de-dupes case-insensitively,
 * and caps the result to avoid pathological epic/story fan-out downstream. */
export function parseFeatureLines(text: string): string[] {
  if (!text || !text.trim()) return [];
  const rawLines = text.includes("\n") ? text.split("\n") : text.split(/[,;\n]/);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of rawLines) {
    const cleaned = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (cleaned.length < MIN_ITEM_CHARS) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= MAX_PARSED_ITEMS) break;
  }
  return result;
}

export type IntakeBucket = "now" | "next" | "later";

export interface CapabilityPlanItem {
  name: string;
  bucket: IntakeBucket;
}

/** Merges the three free-text answers into a Now/Next/Later capability plan. Q3
 * (priority) wins placement over Q4 (next) over leftover Q2 (features) — an item
 * named in more than one answer is only created once, in its highest-priority bucket. */
export function buildCapabilityPlan(
  featuresText: string,
  priorityText: string,
  nextText: string,
): CapabilityPlanItem[] {
  const placed = new Map<string, CapabilityPlanItem>();

  const place = (lines: string[], bucket: IntakeBucket) => {
    for (const name of lines) {
      const key = name.toLowerCase();
      if (placed.has(key)) continue;
      placed.set(key, { name, bucket });
    }
  };

  place(parseFeatureLines(priorityText), "now");
  place(parseFeatureLines(nextText), "next");
  place(parseFeatureLines(featuresText), "later");

  return Array.from(placed.values());
}

/**
 * Guided-activation restructure (reference doc §5): Some Experience's
 * shorter 4-question flow has no dedicated prioritization question ("What
 * are the major things you already know need to be delivered?" is asked as
 * one plain list, not split into now/next/later the way Beginner's Q3+Q4
 * are) — every listed item is treated as equally must-deliver (the "now"/MVP
 * bucket), since the user said they already know it's needed.
 */
export function buildCapabilityPlanAllMvp(featuresText: string): CapabilityPlanItem[] {
  return parseFeatureLines(featuresText).map((name) => ({ name, bucket: "now" as const }));
}

/** Fixed, non-invented field mapping per bucket — no scoring heuristics. The 5
 * simplified-intake answers only carry signal for priority; effort and risk are
 * flat, documented assumptions (same spirit as the defaults ImportIntakePanel
 * already uses for unscored capabilities). */
export function capabilityFieldsForBucket(bucket: IntakeBucket): {
  isMvp: boolean;
  effortSize: "m";
  businessValue: "high" | "medium" | "low";
  riskLevel: "medium";
} {
  switch (bucket) {
    case "now":
      return { isMvp: true, effortSize: "m", businessValue: "high", riskLevel: "medium" };
    case "next":
      return { isMvp: false, effortSize: "m", businessValue: "medium", riskLevel: "medium" };
    case "later":
      return { isMvp: false, effortSize: "m", businessValue: "low", riskLevel: "medium" };
  }
}

const MAX_NAME_LENGTH = 60;
const FALLBACK_INITIATIVE_NAME = "My Product";

/** First clause of the Q1 "What is your product?" answer, trimmed — always
 * editable on the review screen, so this doesn't count as a 6th question. */
export function deriveInitiativeName(productAnswer: string): string {
  const trimmed = productAnswer.trim();
  if (trimmed.length === 0) return FALLBACK_INITIATIVE_NAME;
  const firstClause = trimmed.split(/[.!?\n]/)[0]?.trim() ?? "";
  const candidate = firstClause.length >= MIN_ITEM_CHARS ? firstClause : trimmed;
  if (candidate.length < MIN_ITEM_CHARS) return FALLBACK_INITIATIVE_NAME;
  return candidate.length > MAX_NAME_LENGTH ? `${candidate.slice(0, MAX_NAME_LENGTH - 1).trim()}…` : candidate;
}

/** Fallback when a level's flow doesn't ask who the product is for (Some
 * Experience, per reference doc §5) or the question was left blank. A fixed,
 * honest placeholder beats guessing a persona from free text — every generated
 * user story is written from this field's point of view (ProductDirectionFields). */
export const DEFAULT_TARGET_CUSTOMER = "The people who will use this product";

/**
 * Guided-activation restructure (reference doc §4 Q2): Beginner's "Who will
 * use it?" chip options, plus an "Other" free-text escape hatch. Multi-select
 * — a product can serve more than one of these at once.
 */
export const AUDIENCE_CHIP_OPTIONS = [
  "Customers",
  "Employees",
  "A specific department",
  "Businesses",
  "Patients",
  "Students",
] as const;

/** Combines chip picks + optional free-text detail into one targetCustomer
 * string; falls back to DEFAULT_TARGET_CUSTOMER when nothing was entered. */
export function composeTargetCustomer(chips: string[], detail: string): string {
  const trimmedDetail = detail.trim();
  if (chips.length === 0 && trimmedDetail.length === 0) return DEFAULT_TARGET_CUSTOMER;
  const chipPart = chips.join(", ");
  if (chipPart && trimmedDetail) return `${chipPart} — ${trimmedDetail}`;
  return chipPart || trimmedDetail;
}

/** Synthesized, not asked: quotes the user's own Q3 answer back into a template
 * sentence. Deterministic string templating, not AI-generated — guaranteed to
 * clear the engine's MIN_OUTCOME_CHARS requirement whenever Q3 (required) has
 * content, without asking a 6th question. */
export function deriveOutcomeStatement(priorityAnswer: string, productAnswer: string): string {
  const priority = priorityAnswer.trim();
  const product = productAnswer.trim();
  const statement =
    priority.length > 0
      ? `Deliver on what matters most first: ${priority}`
      : `Bring "${product || "this product"}" to life for the people who need it.`;
  return statement.length >= MIN_OUTCOME_CHARS ? statement : `${statement} That's the outcome this plan is built around.`;
}

/**
 * Guided-activation restructure (reference doc §5 Q1): Some Experience asks
 * for the intended outcome directly instead of Beginner's synthesized
 * deriveOutcomeStatement — this only needs to guarantee the engine's minimum
 * length, not invent content.
 */
export function finalizeOutcomeStatement(rawOutcomeAnswer: string): string {
  const trimmed = rawOutcomeAnswer.trim();
  return trimmed.length >= MIN_OUTCOME_CHARS ? trimmed : `${trimmed} That's the outcome this plan is built around.`;
}

// Guided-activation restructure (reference doc §4 Q5 / §5 Q4): added "1"
// (Beginner's "Next month") and "none" (both levels' "I don't know yet"/"No
// date yet" escape hatch) — "3"/"6"/"9"/"12" keep their original meaning and
// computeTargetLaunchDate behavior unchanged (existing tests cover exactly
// those four).
export type TimelineBucket = "1" | "3" | "6" | "9" | "12" | "none";

export const BEGINNER_TIMELINE_OPTIONS: { value: TimelineBucket; label: string }[] = [
  { value: "1", label: "Next month" },
  { value: "3", label: "This quarter" },
  { value: "6", label: "Within 6 months" },
  { value: "12", label: "Within a year" },
  { value: "none", label: "I don't know yet" },
];

/** Reference doc §5 Q4 examples: "Target date / Quarter / 6–12 months / No
 * date yet" — a full custom date picker was scoped out as a cosmetic-only
 * refinement (targetLaunchDate is display-only, never read by generation);
 * these bucket labels cover the same range/no-date intent. */
export const SOME_EXPERIENCE_TIMELINE_OPTIONS: { value: TimelineBucket; label: string }[] = [
  { value: "3", label: "This quarter" },
  { value: "9", label: "6–12 months" },
  { value: "12", label: "Beyond a year" },
  { value: "none", label: "No date yet" },
];

/** Initiative.targetLaunchDate is display-only (never read by the generation
 * engine), so this is purely cosmetic: today + N months from the picked
 * bucket, or null for "none" (no date given). */
export function computeTargetLaunchDate(bucket: TimelineBucket, now: Date = new Date()): Date | null {
  if (bucket === "none") return null;
  const months = Number(bucket);
  const result = new Date(now);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** IntakeAnswerSet.teamSize default, sourced from the onboarding Solo/Team answer
 * (QualifyingProfile.teamComposition) rather than a flat constant — a documented,
 * later-editable assumption via the existing assumptions-patch/recalculate flow. */
export function defaultTeamSize(teamComposition: string | null | undefined): number {
  return teamComposition === "solo" ? 1 : 3;
}
