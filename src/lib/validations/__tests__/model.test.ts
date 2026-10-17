import { describe, expect, it } from "vitest";
import { validationCommandSchema, validationCreateSchema } from "../model";

const criterion = { criterionId: "criterion-a", result: "met", reason: "", evidenceNotes: "Observed in the sprint review." };

describe("Product Owner validation commands", () => {
  it("links validation to a delivered sprint story and optional review evidence", () => {
    expect(validationCreateSchema.safeParse({ sprintId: "sprint-a", storyId: "story-a", demoItemId: "demo-a", sprintReviewId: "review-a" }).success).toBe(true);
    expect(validationCreateSchema.safeParse({ sprintId: "", storyId: "story-a" }).success).toBe(false);
  });

  it("requires an explicit final decision, rationale, and complete criterion results", () => {
    expect(validationCommandSchema.safeParse({ action: "finalize", expectedRevision: 1, status: "accepted", decisionReason: "All approved outcomes were demonstrated.", criteria: [criterion], createFollowUp: false, followUpTitle: "", reason: "PO accepted delivery" }).success).toBe(true);
    expect(validationCommandSchema.safeParse({ action: "finalize", expectedRevision: 1, status: "accepted", decisionReason: "", criteria: [criterion], createFollowUp: false, followUpTitle: "", reason: "PO accepted delivery" }).success).toBe(false);
  });

  it("keeps AI evidence use explicit and validates evidence links", () => {
    expect(validationCommandSchema.safeParse({ action: "use_ai", expectedRevision: 2, suggestionId: "suggestion-a", evidenceNotes: "Source-grounded summary edited by the PO.", reason: "PO approved AI draft" }).success).toBe(true);
    expect(validationCommandSchema.safeParse({ action: "update", expectedRevision: 2, validatorStakeholderId: null, evidenceNotes: "Evidence", evidenceLinks: ["not-a-url"], criteria: [criterion], reason: "Saved evidence" }).success).toBe(false);
  });
});
