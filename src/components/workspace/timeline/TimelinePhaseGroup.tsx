"use client";

import type { ClientTimelinePhaseGroup } from "@/lib/roadmap/loadRoadmapTimelineData";
import type { TimeAxis } from "@/lib/roadmap/timelineScale";
import { LEFT_COL_PX } from "./layout";
import TimelineRow from "./TimelineRow";

/** One Phase lane group — a clear section label row, then one row per Feature (§5). */
export default function TimelinePhaseGroup(props: {
  group: ClientTimelinePhaseGroup;
  axis: TimeAxis;
  selectedFeatureId: string | null;
  onSelect: (id: string) => void;
}) {
  const { group, axis } = props;
  if (group.features.length === 0) return null;

  return (
    <div>
      <div className="flex bg-surface">
        <div
          className="sticky left-0 z-10 shrink-0 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
          style={{ width: LEFT_COL_PX }}
        >
          {group.name}
        </div>
        <div style={{ width: axis.totalPx }} />
      </div>
      {group.features.map((feature) => (
        <TimelineRow
          key={feature.id}
          feature={feature}
          axis={axis}
          selected={props.selectedFeatureId === feature.id}
          onSelect={props.onSelect}
        />
      ))}
    </div>
  );
}
