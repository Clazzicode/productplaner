// Roadmap versioning foundation — pure, DB-free diff between two roadmap
// snapshots ({capturedAt, layers, sprints, releases}, the same shape
// versioning.ts's buildLiveSnapshot / Prototype.approvedBaselineJson use).
// Deliberately a small set-diff over the fields the product spec calls out
// (features added/removed, phase count, story points/cost), not a generic
// JSON differ — mirrors engine.ts's capabilitySetDrifted in spirit.

export interface SnapshotLayer {
  id: string;
  type: string;
  parentId: string | null;
  order: number;
  title: string;
  body: string;
  points: number | null;
  sprintId: string | null;
  sourceCapabilityId: string | null;
}

export interface SnapshotShape {
  capturedAt: string;
  layers: SnapshotLayer[];
}

export interface RoadmapDiffSummary {
  featuresAdded: string[];
  featuresRemoved: string[];
  phaseCountBefore: number;
  phaseCountAfter: number;
  totalPointsBefore: number;
  totalPointsAfter: number;
  estimatedCostBefore: number;
  estimatedCostAfter: number;
}

/** A feature's identity for comparison purposes: its source Capability when
 * generated normally, falling back to title for the rare hand-edited case
 * where sourceCapabilityId might be absent. */
function featureKey(layer: SnapshotLayer): string {
  return layer.sourceCapabilityId ?? `title:${layer.title}`;
}

function totalPoints(snapshot: SnapshotShape): number {
  return snapshot.layers
    .filter((l) => l.type === "story")
    .reduce((sum, story) => sum + (story.points ?? 0), 0);
}

/**
 * costPerStoryPoint applies the CURRENT cost model to both sides — no
 * historical cost-per-point is stored anywhere, so the cost delta is an
 * approximation using today's rate, not a true point-in-time figure.
 */
export function diffRoadmapSnapshots(
  before: SnapshotShape,
  after: SnapshotShape,
  costPerStoryPoint: number,
): RoadmapDiffSummary {
  const beforeFeatures = new Map(
    before.layers.filter((l) => l.type === "feature").map((l) => [featureKey(l), l.title]),
  );
  const afterFeatures = new Map(
    after.layers.filter((l) => l.type === "feature").map((l) => [featureKey(l), l.title]),
  );
  const featuresAdded = [...afterFeatures].filter(([key]) => !beforeFeatures.has(key)).map(([, title]) => title);
  const featuresRemoved = [...beforeFeatures].filter(([key]) => !afterFeatures.has(key)).map(([, title]) => title);

  const totalPointsBefore = totalPoints(before);
  const totalPointsAfter = totalPoints(after);

  return {
    featuresAdded,
    featuresRemoved,
    phaseCountBefore: before.layers.filter((l) => l.type === "roadmap_phase").length,
    phaseCountAfter: after.layers.filter((l) => l.type === "roadmap_phase").length,
    totalPointsBefore,
    totalPointsAfter,
    estimatedCostBefore: totalPointsBefore * costPerStoryPoint,
    estimatedCostAfter: totalPointsAfter * costPerStoryPoint,
  };
}
