"use client";

import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";
import { blockPosition, type TimeAxis } from "@/lib/roadmap/timelineScale";
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
    <div className="roadmap-timeline-row flex border-b border-border-subtle last:border-b-0">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border-subtle bg-white px-2"
        style={{ width: "var(--timeline-left-col)", height: "var(--timeline-row-height)" }}
      >
        <button type="button" onClick={() => props.onSelect(feature.id)} className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-text-primary ${props.selected ? "border border-accent bg-indigo-50" : ""}`} title={feature.title}>
          {feature.title}
        </button>
      </div>
      <div className="relative shrink-0" style={{ width: axis.totalPx, height: "var(--timeline-row-height)" }}>
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
