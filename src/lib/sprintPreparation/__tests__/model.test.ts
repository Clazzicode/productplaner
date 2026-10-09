import { describe, expect, it } from "vitest";
import { readinessDecisionSchema, sprintPlanSaveSchema } from "../model";

describe("sprint preparation inputs", () => {
  it("requires a meaningful reason for a readiness override", () => {
    expect(readinessDecisionSchema.safeParse({ target: { type: "story", id: "story-a" }, decision: "overridden", reason: "no" }).success).toBe(false);
    expect(readinessDecisionSchema.safeParse({ target: { type: "story", id: "story-a" }, decision: "overridden", reason: "PO reviewed the remaining dependency." }).success).toBe(true);
  });

  it("rejects duplicate work in a sprint plan", () => {
    const result = sprintPlanSaveSchema.safeParse({ sprintId: "sprint-a", goal: "Deliver the first usable outcome", items: [
      { target: { type: "story", id: "story-a" }, estimatePoints: 3 },
      { target: { type: "story", id: "story-a" }, estimatePoints: 3 },
    ] });
    expect(result.success).toBe(false);
  });

  it("accepts a bounded plan containing stories and bugs", () => {
    const result = sprintPlanSaveSchema.safeParse({ sprintId: "sprint-a", goal: "Deliver a stable planning workflow", commit: false, items: [
      { target: { type: "story", id: "story-a" }, estimatePoints: 5 },
      { target: { type: "bug", id: "bug-a" }, estimatePoints: 2 },
    ] });
    expect(result.success).toBe(true);
  });
});
