// Pure computed view (never persisted) — matches FR-19's "generated from live
// data" discipline: the forecast can't go stale because it doesn't exist at rest.

export interface SprintForecast {
  sprintNumber: number;
  phaseNumber: number;
  capacityPoints: number;
  plannedPoints: number;
  variancePercent: number;
  status: "within-capacity" | "over-allocated";
}

export function computeCapacityForecast(
  sprints: {
    sprintNumber: number;
    phaseNumber: number;
    capacityPoints: number;
    stories: { points: number | null }[];
  }[],
): SprintForecast[] {
  return sprints.map((s) => {
    const planned = s.stories.reduce((n, story) => n + (story.points ?? 1), 0);
    const variance =
      s.capacityPoints > 0 ? ((planned - s.capacityPoints) / s.capacityPoints) * 100 : 0;
    return {
      sprintNumber: s.sprintNumber,
      phaseNumber: s.phaseNumber,
      capacityPoints: s.capacityPoints,
      plannedPoints: planned,
      variancePercent: Math.round(variance * 10) / 10,
      status: planned > s.capacityPoints ? "over-allocated" : "within-capacity",
    };
  });
}
