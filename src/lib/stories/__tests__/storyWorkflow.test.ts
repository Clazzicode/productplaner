import { describe, expect, it } from "vitest";
import { storyReadiness } from "../service";
import { acceptanceCriteriaReorderSchema, acceptanceCriterionCreateSchema, storyCreateSchema, storySplitSchema } from "@/lib/validation/schemas";

describe("story, acceptance criteria, and refinement workflow", () => {
  it("requires Jira identity for imported stories and accepts a manual story", () => {
    const base = { epicId: "epic-1", title: "Save a view", body: "As a planner, I want to save a view, so that I can resume work.", points: 3 };
    expect(storyCreateSchema.safeParse({ ...base, sourceType: "manual" }).success).toBe(true);
    expect(storyCreateSchema.safeParse({ ...base, sourceType: "jira" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ ...base, sourceType: "jira", externalRef: "GP-123" }).success).toBe(true);
  });

  it("requires at least two valid children when splitting a story", () => {
    const story = { title: "Part one", body: "As a user, I want one result, so that I can proceed.", points: 3 };
    expect(storySplitSchema.safeParse({ stories: [story] }).success).toBe(false);
    expect(storySplitSchema.safeParse({ stories: [story, { ...story, title: "Part two" }] }).success).toBe(true);
  });

  it("explains exactly why a story is not ready", () => {
    const incomplete = storyReadiness({ title: "Save", body: "Save the view", points: null, readinessStatus: "needs_refinement", criteria: [] });
    expect(incomplete.ready).toBe(false);
    expect(incomplete.gaps).toEqual(expect.arrayContaining(["Use a clear As a / I want / so that outcome.", "Add a story-point estimate.", "Add at least two acceptance criteria."]));
    const ready = storyReadiness({ title: "Save", body: "As a planner, I want to save a view, so that I can resume work.", points: 3, readinessStatus: "ready_for_refinement", criteria: [
      { body: "Given a valid view, when I save, then it is available later." },
      { body: "Given a saved view, when I open it, then its filters are restored." },
    ] });
    expect(ready).toEqual({ ready: true, gaps: [] });
  });

  it("validates testable criteria and safe reorder commands", () => {
    expect(acceptanceCriterionCreateSchema.safeParse({ title: "Restore filters", body: "Given a saved view, when it opens, then filters are restored." }).success).toBe(true);
    expect(acceptanceCriteriaReorderSchema.safeParse({ orderedIds: ["a", "a"] }).success).toBe(false);
    expect(acceptanceCriteriaReorderSchema.safeParse({ orderedIds: ["b", "a"] }).success).toBe(true);
  });
});
