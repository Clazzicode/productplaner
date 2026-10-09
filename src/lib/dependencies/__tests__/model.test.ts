import { describe, expect, it } from "vitest";
import { blockerUpdateSchema, dependencyCreateSchema } from "../model";
import { createsDependencyCycle } from "../service";

describe("dependency and blocker rules", () => {
  it("detects direct and transitive cycles", () => {
    expect(createsDependencyCycle([["story:a", "story:b"], ["story:b", "story:c"]], "story:c", "story:a")).toBe(true);
    expect(createsDependencyCycle([["story:a", "story:b"]], "story:c", "story:a")).toBe(false);
  });
  it("requires a resolution when resolving a blocker", () => {
    expect(blockerUpdateSchema.safeParse({ expectedRevision: 1, status: "resolved", reason: "Done" }).success).toBe(false);
  });
  it("accepts typed work endpoints", () => {
    expect(dependencyCreateSchema.safeParse({ predecessor: { type: "bug", id: "b1" }, dependent: { type: "story", id: "s1" }, dependencyType: "blocks", description: "" }).success).toBe(true);
  });
});
