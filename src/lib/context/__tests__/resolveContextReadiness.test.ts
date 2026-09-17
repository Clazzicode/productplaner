import { describe, expect, it } from "vitest";
import { resolveContextReadiness } from "../resolveContextReadiness";

describe("resolveContextReadiness", () => {
  it("context_ready when there are no gaps, conflicts, or pending-review items", () => {
    expect(resolveContextReadiness({ gaps: [], pendingConflictCount: 0, pendingNeedsReviewCount: 0 })).toBe(
      "context_ready",
    );
  });

  it("context_needs_review when gaps remain", () => {
    expect(resolveContextReadiness({ gaps: ["budget"], pendingConflictCount: 0, pendingNeedsReviewCount: 0 })).toBe(
      "context_needs_review",
    );
  });

  it("context_needs_review when a conflict is unresolved", () => {
    expect(resolveContextReadiness({ gaps: [], pendingConflictCount: 1, pendingNeedsReviewCount: 0 })).toBe(
      "context_needs_review",
    );
  });

  it("context_needs_review when items still need review", () => {
    expect(resolveContextReadiness({ gaps: [], pendingConflictCount: 0, pendingNeedsReviewCount: 2 })).toBe(
      "context_needs_review",
    );
  });

  it("context_needs_review when all three are present at once", () => {
    expect(resolveContextReadiness({ gaps: ["goal"], pendingConflictCount: 1, pendingNeedsReviewCount: 1 })).toBe(
      "context_needs_review",
    );
  });
});
