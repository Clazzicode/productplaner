import { describe, expect, it } from "vitest";
import { buildImportFieldReview, fieldBaselines } from "../fieldReview";
import type { JiraIssueSnapshot } from "../client";
const issue: JiraIssueSnapshot = { id: "1", key: "ABC-1", summary: "Remote title", description: "Remote body", issueType: { id: "story", name: "Story", subtask: false }, status: { id: "done", name: "Done", category: "done" }, priority: null, labels: [], parentKey: null, storyPoints: 30, updated: null };
const local = { title: "Remote title", body: "Remote body", points: 21, readinessStatus: "needs_refinement" };
const review = (overrides = {}) => buildImportFieldReview({ issue, targetType: "story", local, targetFingerprint: "a".repeat(64), baselineHashes: fieldBaselines(issue, "story", local), baselineAt: "2026-11-08T00:00:00Z", localChanged: false, remoteChanged: false, ...overrides });
describe("reviewed Jira field ownership", () => {
  it("compares independent field hashes without retaining source text in mappings", () => {
    const hashes = fieldBaselines(issue, "story", local);
    expect(JSON.stringify(hashes)).not.toContain("Remote");
    expect(Object.values(hashes).every(row => /^[a-f0-9]{64}$/.test(row.sourceHash) && /^[a-f0-9]{64}$/.test(row.localHash))).toBe(true);
    const result = review({ issue: { ...issue, summary: "New remote" }, local: { ...local, body: "Human edit" }, localChanged: true, remoteChanged: true });
    expect(result.fields.find(row => row.field === "summary")).toMatchObject({ localChanged: false, remoteChanged: true, before: "Remote title", proposed: "New remote" });
    expect(result.fields.find(row => row.field === "description")).toMatchObject({ localChanged: true, remoteChanged: false, before: "Human edit" });
  });
  it("shows the exact normalized estimate and preserves local acceptance despite Jira done", () => {
    expect(review().fields.find(row => row.field === "points")).toMatchObject({ before: 21, proposed: 21, sourceValue: 30 });
    expect(review().fields.find(row => row.field === "planningStatus")).toMatchObject({ proposed: "needs_refinement", willApply: false });
  });
  it("reports unknown baselines on legacy links and never implies a skipped import applies", () => {
    expect(review({ baselineHashes: null }).fields.every(row => row.localChanged === null && row.remoteChanged === null)).toBe(true);
    expect(review({ targetType: "skip" }).fields.every(row => !row.willApply)).toBe(true);
  });
  it("uses local initial status rather than converting Jira execution into planning approval", () => {
    expect(review({ local: null, targetType: "bug" }).fields.find(row => row.field === "planningStatus")).toMatchObject({ before: null, proposed: "reported", willApply: false });
  });
});
