import { describe, expect, it } from "vitest";
import { reviewCommandSchema, reviewGenerateSchema } from "../model";

describe("sprint review commands", () => {
  it("requires optimistic revisions and explicit finalization reasons", () => {
    expect(reviewGenerateSchema.safeParse({ sprintId: "sprint-a" }).success).toBe(true);
    expect(reviewCommandSchema.safeParse({ action: "finalize", expectedRevision: 2, overrideReason: "", reason: "PO approved the sprint review" }).success).toBe(true);
    expect(reviewCommandSchema.safeParse({ action: "finalize", expectedRevision: 0, overrideReason: "", reason: "ok" }).success).toBe(false);
  });

  it("keeps AI use explicit and validates structured meeting records", () => {
    expect(reviewCommandSchema.safeParse({ action: "use_summary", expectedRevision: 1, suggestionId: "suggestion-a", summary: "The sprint delivered the documented outcome.", reason: "PO approved AI draft" }).success).toBe(true);
    expect(reviewCommandSchema.safeParse({ action: "decision", expectedRevision: 1, title: "", rationale: "Because", decisionMakerStakeholderId: null, reason: "Decision recorded" }).success).toBe(false);
    expect(reviewCommandSchema.safeParse({ action: "follow_up", expectedRevision: 1, title: "Confirm release evidence", ownerStakeholderId: null, dueAt: null, reason: "Follow-up recorded" }).success).toBe(true);
  });
});
