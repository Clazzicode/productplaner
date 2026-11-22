"use client";

import { useState } from "react";
import { confirmPageNavigation } from "@/components/shell/unsavedChanges";

export type RoadmapView = "planning" | "timeline" | "milestones" | "connections";

const VIEWS: { value: RoadmapView; label: string }[] = [
  { value: "planning", label: "Now / Next / Later" },
  { value: "timeline", label: "Timeline" },
  { value: "milestones", label: "Milestones" },
  { value: "connections", label: "Connections" },
];

/**
 * Replaces the old 2-way List/"Timeline" toggle (RoadmapViewToggle — the
 * "Timeline" tab there was actually a Kanban board). This is the real 3-view
 * product direction: Timeline / Milestones / Connections, all lenses over the
 * same authorized roadmap data (docs/V2-ROADMAP-ARCHITECTURE.md §17), passed
 * in as already-rendered nodes so the page itself stays a server component.
 */
export default function RoadmapViewSwitcher(props: {
  timeline: React.ReactNode;
  planning: React.ReactNode;
  milestones: React.ReactNode;
  connections: React.ReactNode;
}) {
  const [view, setView] = useState<RoadmapView>("planning");

  return (
    <div>
      <div className="roadmap-view-tabs" role="tablist" aria-label="Roadmap views">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            id={`roadmap-tab-${v.value}`}
            onClick={() => { if (confirmPageNavigation()) setView(v.value); }}
            onKeyDown={(event) => {
              const index = VIEWS.findIndex((item) => item.value === v.value);
              const next = event.key === "ArrowRight" ? (index + 1) % VIEWS.length
                : event.key === "ArrowLeft" ? (index - 1 + VIEWS.length) % VIEWS.length
                  : event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              if (confirmPageNavigation()) {
                setView(VIEWS[next].value);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }
            }}
            role="tab"
            aria-selected={view === v.value}
            aria-controls="roadmap-tab-panel"
            tabIndex={view === v.value ? 0 : -1}
            className={view === v.value ? "is-active" : ""}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div id="roadmap-tab-panel" className="roadmap-view-content" role="tabpanel" aria-labelledby={`roadmap-tab-${view}`}>
        {view === "planning" && props.planning}
        {view === "timeline" && props.timeline}
        {view === "milestones" && props.milestones}
        {view === "connections" && props.connections}
      </div>
    </div>
  );
}
