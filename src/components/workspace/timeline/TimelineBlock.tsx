"use client";

import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";
import { ROW_HEIGHT_PX } from "./layout";

/** The bar style exposes whether timing comes from sprint dates or a phase estimate. */
export default function TimelineBlock(props: {
  feature: ClientTimelineFeature; left: number; width: number; selected: boolean; onSelect: () => void;
}) {
  const estimated = props.feature.scheduleSource !== "sprints";
  return <button type="button" onClick={props.onSelect} title={`${props.feature.title} · ${estimated ? "Phase estimate" : "From sprint dates"}`}
    aria-label={`Open ${props.feature.title} timeline details`}
    style={{ left: props.left, width: props.width, height: ROW_HEIGHT_PX - 34 }}
    className={`roadmap-timebar absolute top-[17px] ${estimated ? "is-estimate" : "is-sprint"} ${props.selected ? "is-selected" : ""}`}>
    <span className="sr-only">{props.feature.title}</span>
  </button>;
}
