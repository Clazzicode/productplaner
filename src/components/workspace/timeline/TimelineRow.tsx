"use client";

import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";
import { blockPosition, type TimeAxis } from "@/lib/roadmap/timelineScale";
import { LEFT_COL_PX, ROW_HEIGHT_PX } from "./layout";
import TimelineBlock from "./TimelineBlock";

/** One Feature row: frozen left name cell + its block positioned on the shared canvas. */
export default function TimelineRow(props: {
  feature: ClientTimelineFeature;
  axis: TimeAxis;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { feature, axis } = props;
  if (!feature.start || !feature.end) return null; // scheduled rows only — unscheduled has its own section

  const { left, width } = blockPosition(axis, new Date(feature.start), new Date(feature.end));

  return (
    <div className="flex border-b border-border-subtle last:border-b-0">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border-subtle bg-white px-3"
        style={{ width: LEFT_COL_PX, height: ROW_HEIGHT_PX }}
      >
        <p className="truncate text-sm text-text-primary" title={feature.title}>
          {feature.title}
        </p>
      </div>
      <div className="relative shrink-0" style={{ width: axis.totalPx, height: ROW_HEIGHT_PX }}>
        <TimelineBlock
          feature={feature}
          left={left}
          width={width}
          selected={props.selected}
          onSelect={() => props.onSelect(feature.id)}
        />
      </div>
    </div>
  );
}
