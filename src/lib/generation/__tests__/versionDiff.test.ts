import { describe, expect, it } from "vitest";
import { diffRoadmapSnapshots, type SnapshotLayer, type SnapshotShape } from "../versionDiff";

const layer = (overrides: Partial<SnapshotLayer>): SnapshotLayer => ({
  id: overrides.id ?? "id",
  type: overrides.type ?? "feature",
  parentId: overrides.parentId ?? null,
  order: overrides.order ?? 0,
  title: overrides.title ?? "Untitled",
  body: overrides.body ?? "",
  points: overrides.points ?? null,
  sprintId: overrides.sprintId ?? null,
  sourceCapabilityId: overrides.sourceCapabilityId ?? null,
  ...overrides,
});

const snapshot = (layers: SnapshotLayer[]): SnapshotShape => ({ capturedAt: "2026-01-01T00:00:00.000Z", layers });

describe("diffRoadmapSnapshots", () => {
  it("detects an added feature", () => {
    const before = snapshot([
      layer({ id: "f1", type: "feature", title: "Sign in", sourceCapabilityId: "cap-1" }),
    ]);
    const after = snapshot([
      layer({ id: "f1", type: "feature", title: "Sign in", sourceCapabilityId: "cap-1" }),
      layer({ id: "f2", type: "feature", title: "Sign up", sourceCapabilityId: "cap-2" }),
    ]);
    const diff = diffRoadmapSnapshots(before, after, 100);
    expect(diff.featuresAdded).toEqual(["Sign up"]);
    expect(diff.featuresRemoved).toEqual([]);
  });

  it("detects a removed feature", () => {
    const before = snapshot([
      layer({ id: "f1", type: "feature", title: "Sign in", sourceCapabilityId: "cap-1" }),
      layer({ id: "f2", type: "feature", title: "Sign up", sourceCapabilityId: "cap-2" }),
    ]);
    const after = snapshot([layer({ id: "f1", type: "feature", title: "Sign in", sourceCapabilityId: "cap-1" })]);
    const diff = diffRoadmapSnapshots(before, after, 100);
    expect(diff.featuresRemoved).toEqual(["Sign up"]);
    expect(diff.featuresAdded).toEqual([]);
  });

  it("reports unchanged features as neither added nor removed", () => {
    const layers = [layer({ id: "f1", type: "feature", title: "Sign in", sourceCapabilityId: "cap-1" })];
    const diff = diffRoadmapSnapshots(snapshot(layers), snapshot(layers), 100);
    expect(diff.featuresAdded).toEqual([]);
    expect(diff.featuresRemoved).toEqual([]);
  });

  it("counts phases and computes point/cost deltas", () => {
    const before = snapshot([
      layer({ id: "p1", type: "roadmap_phase" }),
      layer({ id: "s1", type: "story", points: 3 }),
      layer({ id: "s2", type: "story", points: 5 }),
    ]);
    const after = snapshot([
      layer({ id: "p1", type: "roadmap_phase" }),
      layer({ id: "p2", type: "roadmap_phase" }),
      layer({ id: "s1", type: "story", points: 3 }),
      layer({ id: "s2", type: "story", points: 5 }),
      layer({ id: "s3", type: "story", points: 2 }),
    ]);
    const diff = diffRoadmapSnapshots(before, after, 100);
    expect(diff.phaseCountBefore).toBe(1);
    expect(diff.phaseCountAfter).toBe(2);
    expect(diff.totalPointsBefore).toBe(8);
    expect(diff.totalPointsAfter).toBe(10);
    expect(diff.estimatedCostBefore).toBe(800);
    expect(diff.estimatedCostAfter).toBe(1000);
  });
});
