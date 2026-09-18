import { isOpenEndedFieldKey } from "./contextFields";

// Document Import & Approved Context (directive items 13/14/22/23). One
// mechanism serving both "conflict within an import" and "conflict against
// already-approved data" — see buildContextItems below. Pure, no I/O: the
// caller (POST /api/documents/[id]/analyze) loads `current`/`pending` and
// persists `toCreate`.

export interface CandidateItem {
  fieldKey: string;
  kind: "explicit" | "interpretation";
  scope: "project" | "initiative";
  value: string; // raw proposed value, as returned by the AI
  sourceExcerpt: string;
  sourceChunkIndex: number | null;
  sourceHeading: string | null;
  sourcePageNumber: number | null;
  sourceSlideNumber: number | null;
}

export interface CurrentValueSnapshot {
  /** fieldKey -> the real, live value already on Project/Initiative/
   * IntakeAnswerSet, normalized the same way normalizeValue() would — or
   * undefined if unset/empty. Scalar fields only (not feature/risk). */
  scalar: Record<string, string | undefined>;
  existingFeatureNames: string[];
  existingRiskDescriptions: string[];
}

export interface PendingItemSummary {
  id: string;
  fieldKey: string;
  value: string; // raw value, normalized internally the same way
}

export interface BuiltContextItem {
  /** Correlates to the candidate's position in the input array — the caller
   * uses this to link cross-document conflict pairings after insert, since
   * a not-yet-created row has no real id yet. */
  tempId: number;
  candidate: CandidateItem;
  status: "extracted" | "conflict";
  conflictsWithExistingValueText: string | null;
  /** A real, already-persisted ContextItem id this new row disagrees with —
   * the caller must link both directions (this row's conflictWithItemId,
   * and flip that other row to status:"conflict" too) after insert. */
  conflictsWithPendingItemId: string | null;
}

export interface BuildContextItemsResult {
  toCreate: BuiltContextItem[];
}

/**
 * Normalizes a proposed/stored value for equality comparison only — never
 * used as the value actually persisted. Numeric for budget, ISO date for
 * date fields, trimmed-lowercase otherwise. Deliberately exact/near-exact
 * only, no fuzzy/semantic matching (a stated scope cut).
 */
/**
 * Extracts the first numeric token regardless of surrounding currency
 * symbols/words ("$150,000", "150000 dollars", "150000 USD" all parse the
 * same) — found via real end-to-end testing: the AI legitimately returns
 * budget as natural-language-adjacent text (e.g. "150000 dollars", quoting
 * the document), which a $/,-only strip doesn't catch. Shared by
 * normalizeValue() here and crystallize.ts's actual DB write, so the two
 * can never parse the same value two different ways.
 */
export function parseBudgetNumber(raw: string): number | null {
  const match = raw.trim().replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

export function normalizeValue(fieldKey: string, value: string): string {
  const trimmed = value.trim();
  if (fieldKey === "budget") {
    const num = parseBudgetNumber(trimmed);
    return num != null ? String(num) : trimmed.toLowerCase();
  }
  if (fieldKey === "projected_go_live" || fieldKey === "initiative_target_date") {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? trimmed.toLowerCase() : date.toISOString().slice(0, 10);
  }
  return trimmed.toLowerCase();
}

export function buildContextItems(params: {
  candidates: CandidateItem[];
  current: CurrentValueSnapshot;
  pending: PendingItemSummary[];
}): BuildContextItemsResult {
  const toCreate: BuiltContextItem[] = [];

  params.candidates.forEach((candidate, tempId) => {
    const normalized = normalizeValue(candidate.fieldKey, candidate.value);

    if (isOpenEndedFieldKey(candidate.fieldKey)) {
      // Many rows per scope are normal for these — never "conflict" with
      // each other, only dedupe against an exact/near-exact match (item 23).
      const existingNames =
        candidate.fieldKey === "feature"
          ? params.current.existingFeatureNames
          : candidate.fieldKey === "risk"
            ? params.current.existingRiskDescriptions
            : [];
      const existingMatch = existingNames.some((n) => n.trim().toLowerCase() === normalized);
      const pendingMatch = params.pending.some(
        (p) => p.fieldKey === candidate.fieldKey && normalizeValue(p.fieldKey, p.value) === normalized,
      );
      if (existingMatch || pendingMatch) return; // duplicate — skip, don't create a second row

      toCreate.push({
        tempId,
        candidate,
        status: "extracted",
        conflictsWithExistingValueText: null,
        conflictsWithPendingItemId: null,
      });
      return;
    }

    // Scalar fact: (a) a real, existing approved value already differs -> conflict.
    const existingValue = params.current.scalar[candidate.fieldKey];
    if (existingValue !== undefined) {
      if (existingValue === normalized) return; // already exactly matches — nothing new to review
      toCreate.push({
        tempId,
        candidate,
        status: "conflict",
        conflictsWithExistingValueText: existingValue,
        conflictsWithPendingItemId: null,
      });
      return;
    }

    // (b) another currently-pending item for the same field, from a
    // different document (the caller pre-filters `pending` to exclude the
    // current document), disagrees -> cross-document conflict, both linked.
    const pendingMatch = params.pending.find((p) => p.fieldKey === candidate.fieldKey);
    if (pendingMatch) {
      const pendingNormalized = normalizeValue(pendingMatch.fieldKey, pendingMatch.value);
      if (pendingNormalized === normalized) return; // duplicate of a pending proposal — skip
      toCreate.push({
        tempId,
        candidate,
        status: "conflict",
        conflictsWithExistingValueText: null,
        conflictsWithPendingItemId: pendingMatch.id,
      });
      return;
    }

    // (c) clean — no existing value, no pending conflict.
    toCreate.push({
      tempId,
      candidate,
      status: "extracted",
      conflictsWithExistingValueText: null,
      conflictsWithPendingItemId: null,
    });
  });

  return { toCreate };
}
