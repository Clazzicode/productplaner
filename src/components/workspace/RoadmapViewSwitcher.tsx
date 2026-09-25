"use client";

import { useState } from "react";

export type RoadmapView = "timeline" | "milestones" | "connections";

const VIEWS: { value: RoadmapView; label: string }[] = [
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
  milestones: React.ReactNode;
  connections: React.ReactNode;
}) {
  const [view, setView] = useState<RoadmapView>("timeline");

  return (
    <div>
      <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-sm">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            onClick={() => setView(v.value)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              view === v.value ? "bg-white text-accent shadow-sm" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {view === "timeline" && props.timeline}
        {view === "milestones" && props.milestones}
        {view === "connections" && props.connections}
      </div>
    </div>
  );
}
