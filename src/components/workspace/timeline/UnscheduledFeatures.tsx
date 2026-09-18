"use client";

import { Badge } from "@/components/ui/Badge";
import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";

/**
 * Every Feature stays discoverable even when it can't be placed on the time
 * axis (no Story has landed in a Sprint yet, or — for Kanban — the phase
 * hasn't been throughput-packed yet). Never invents a placement; this is the
 * honest alternative (§"Unscheduled Lane").
 */
export default function UnscheduledFeatures(props: {
  features: ClientTimelineFeature[];
  selectedFeatureId: string | null;
  onSelect: (id: string) => void;
}) {
  if (props.features.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Unscheduled · {props.features.length}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">
        No Stories have landed in a Sprint yet, so these Features have no real date to plot — shown
        here instead of a guessed position.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {props.features.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => props.onSelect(f.id)}
            className={`flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs shadow-sm transition hover:border-accent/50 ${
              props.selectedFeatureId === f.id ? "border-accent" : "border-neutral-200"
            }`}
          >
            {f.isMvp && (
              <Badge variant="indigo" className="px-1.5 py-0 text-[10px]">
                MVP
              </Badge>
            )}
            <span className="font-medium text-text-primary">{f.title}</span>
            <span className="text-text-muted">· {f.phaseName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
