"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/Badge";
import type { ClientTimelineFeature, ClientTimelinePhaseGroup } from "@/lib/roadmap/loadRoadmapTimelineData";
import { TIMELINE_HEALTH_LABELS } from "@/lib/roadmap/timelineDerivation";

const HEALTH_DOT: Record<NonNullable<ClientTimelineFeature["health"]>, string> = {
  on_track: "bg-health-good",
  attention: "bg-health-attention",
  warning: "bg-health-warning",
  critical: "bg-health-critical",
};

/**
 * Mobile fallback (§"Responsive Behavior" / §20): the desktop time-axis grid
 * doesn't compress into anything readable below ~640px, so phones get this
 * simplified, read-only, vertically-stacked list instead — never a
 * squeezed-down attempt at the same grid. Same data, same filters, same
 * detail drawer on tap; just a different shape.
 */
export default function TimelineMobileList(props: {
  phases: ClientTimelinePhaseGroup[];
  unscheduled: ClientTimelineFeature[];
  onSelect: (id: string) => void;
}) {
  const nonEmptyPhases = props.phases.filter((p) => p.features.length > 0);

  if (nonEmptyPhases.length === 0 && props.unscheduled.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">No Features match the current filters.</p>;
  }

  return (
    <div className="space-y-5">
      {nonEmptyPhases.map((group) => (
        <div key={group.phaseNumber}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{group.name}</p>
          <div className="mt-2 space-y-2">
            {group.features.map((f) => (
              <FeatureRow key={f.id} feature={f} onSelect={props.onSelect} />
            ))}
          </div>
        </div>
      ))}

      {props.unscheduled.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Unscheduled</p>
          <div className="mt-2 space-y-2">
            {props.unscheduled.map((f) => (
              <FeatureRow key={f.id} feature={f} onSelect={props.onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureRow(props: { feature: ClientTimelineFeature; onSelect: (id: string) => void }) {
  const { feature } = props;
  const start = feature.start ? new Date(feature.start) : null;
  const end = feature.end ? new Date(feature.end) : null;

  return (
    <button
      type="button"
      onClick={() => props.onSelect(feature.id)}
      className="flex w-full flex-col gap-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-left shadow-sm active:bg-neutral-50"
    >
      <div className="flex items-center gap-1.5">
        {feature.isMvp && (
          <Badge variant="indigo" className="shrink-0 px-1.5 py-0 text-[10px]">
            MVP
          </Badge>
        )}
        <span className="truncate text-sm font-semibold text-text-primary">{feature.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {feature.health ? (
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${HEALTH_DOT[feature.health]}`} aria-hidden />
            {TIMELINE_HEALTH_LABELS[feature.health]}
          </span>
        ) : (
          <span>No date yet</span>
        )}
        <span>{start && end ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}` : "Unscheduled"}</span>
        {feature.dependsOnNames.length > 0 && <span>🔗 {feature.dependsOnNames.length}</span>}
      </div>
    </button>
  );
}
