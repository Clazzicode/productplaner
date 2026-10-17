import { describe, expect, it } from "vitest";
import { clarificationAnswerSchema, clarificationCommandSchema, clarificationCreateSchema } from "../model";

describe("in-sprint clarification inputs", () => {
  it("requires exactly one committed-work target shape", () => {
    const base = { sprintId: "sprint-a", question: "What should happen when the provider is unavailable?" };
    expect(clarificationCreateSchema.safeParse({ ...base, storyId: "story-a" }).success).toBe(true);
    expect(clarificationCreateSchema.safeParse({ ...base, bugId: "bug-a" }).success).toBe(true);
    expect(clarificationCreateSchema.safeParse(base).success).toBe(false);
    expect(clarificationCreateSchema.safeParse({ ...base, storyId: "story-a", bugId: "bug-a" }).success).toBe(false);
  });

  it("requires rationale when the answer changes approved work", () => {
    const base = { action: "answer", expectedRevision: 1, reason: "PO answered", answer: "Keep the current behavior." };
    expect(clarificationAnswerSchema.safeParse({ ...base, impact: "none", rationale: "" }).success).toBe(true);
    expect(clarificationAnswerSchema.safeParse({ ...base, impact: "scope_change", rationale: "" }).success).toBe(false);
    expect(clarificationAnswerSchema.safeParse({ ...base, impact: "scope_change", rationale: "The requested behavior expands the agreed scope." }).success).toBe(true);
  });

  it("accepts only controlled lifecycle actions", () => {
    expect(clarificationCommandSchema.safeParse({ action: "acknowledge", expectedRevision: 2, reason: "Answer received" }).success).toBe(true);
    expect(clarificationCommandSchema.safeParse({ action: "message", expectedRevision: 2, reason: "Free form chat" }).success).toBe(false);
  });
});

