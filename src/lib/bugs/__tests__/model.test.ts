import { describe, expect, it } from "vitest";
import { bugPlanningUpdateSchema } from "../model";

describe("bug planning updates", () => {
  it("accepts planning links and a documented change", () => {
    expect(bugPlanningUpdateSchema.parse({
      expectedRevision: 2,
      status: "in_progress",
      readinessStatus: "ready_for_refinement",
      affectedCapabilityId: "feature-a",
      affectedReleaseId: "release-a",
      reason: "Confirmed during triage",
    })).toMatchObject({ status: "in_progress", affectedReleaseId: "release-a" });
  });

  it("requires optimistic concurrency and a change reason", () => {
    expect(bugPlanningUpdateSchema.safeParse({ expectedRevision: 0, status: "closed", reason: "x" }).success).toBe(false);
  });
});
