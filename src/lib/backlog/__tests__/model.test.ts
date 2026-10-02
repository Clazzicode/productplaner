import { describe, expect, it } from "vitest";
import { featureSchema } from "../model";
import { poFeatureRecords } from "../poFeatures";

describe("PO feature backlog", () => {
  it("contains each numbered PO feature once", () => {
    const records = poFeatureRecords();
    expect(records).toHaveLength(21);
    expect(new Set(records.map(record => record.backlogKey)).size).toBe(21);
    expect(records[0].name).toBe("Request / Intake Management");
    expect(records[20].name).toBe("Jira Integration");
  });
  it("reflects the agreed implementation priorities without claiming completion", () => {
    const records = poFeatureRecords();
    expect(records.filter(record => record.backlogStatus === "in_progress").map(record => record.backlogKey)).toEqual(["PO-04", "PO-05", "PO-07"]);
    expect(records.filter(record => record.backlogStatus === "ready_for_review").map(record => record.backlogKey)).toEqual(["PO-01", "PO-02", "PO-06"]);
    expect(records.some(record => record.backlogStatus === "done")).toBe(false);
  });
  it("rejects unsupported lane and status values", () => {
    expect(featureSchema.safeParse({ name: "Feature", description: "", backlogLane: "soon", backlogStatus: "done" }).success).toBe(false);
    expect(featureSchema.safeParse({ name: "Feature", description: "", backlogLane: "now", backlogStatus: "maybe" }).success).toBe(false);
  });
});
