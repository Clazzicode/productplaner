// Document Import & Approved Context (directive item 33). Same style as
// src/lib/lifecycle/resolveLifecycleState.ts — pure, callers load the
// handful of DB facts and pass them in.

export type ContextReadiness = "context_ready" | "context_needs_review";

export interface ContextReadinessInput {
  gaps: string[];
  pendingConflictCount: number;
  pendingNeedsReviewCount: number;
}

/**
 * Advisory only — this never gates "Continue to Planning," which stays
 * clickable regardless of the result (matches this codebase's consistent
 * non-blocking philosophy elsewhere: the roadmap drift badge,
 * AiUsageLimitExceededError's "existing projects and approved artifacts are
 * still available" language). A future reader should not "fix" this into a
 * hard gate.
 */
export function resolveContextReadiness(input: ContextReadinessInput): ContextReadiness {
  return input.gaps.length === 0 && input.pendingConflictCount === 0 && input.pendingNeedsReviewCount === 0
    ? "context_ready"
    : "context_needs_review";
}
