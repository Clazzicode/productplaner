"use client";

import { Badge } from "@/components/ui/Badge";
import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";
import { TIMELINE_HEALTH_LABELS, type TimelineHealth } from "@/lib/roadmap/timelineDerivation";
import { ROW_HEIGHT_PX } from "./layout";

// border-l-4 sets left-side WIDTH; the plain (all-sides) color utility only
// paints where a side has nonzero width, so this reliably renders as a
// left-edge strip without depending on Tailwind generating per-side color
// utilities for the custom health-* theme tokens.
const HEALTH_BORDER: Record<TimelineHealth, string> = {
  on_track: "border-l-4 border-health-good",
  attention: "border-l-4 border-health-attention",
  warning: "border-l-4 border-health-warning",
  critical: "border-l-4 border-health-critical",
};

const HEALTH_DOT: Record<TimelineHealth, string> = {
  on_track: "bg-health-good",
  attention: "bg-health-attention",
  warning: "bg-health-warning",
  critical: "bg-health-critical",
};

/**
 * One Feature block on the Timeline canvas. Presentational only — position
 * (left/width) is computed by the caller from the shared axis so every block
 * agrees on the same day-to-pixel scale (docs/V2-ROADMAP-TIMELINE.md §7).
 * Health is shown as a left edge strip + small dot (never a full-block fill —
 * §8/product direction), and is entirely absent (no strip, no dot) when the
 * Feature has no derivable health, rather than guessing one.
 */
export default function TimelineBlock(props: {
  feature: ClientTimelineFeature;
  left: number;
  width: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { feature, width } = props;
  const dependencyCount = feature.dependsOnNames.length;
  // Narrow blocks (compressed Year zoom on a short Sprint span) adapt their
  // content instead of truncating everything to a couple of characters: the
  // full MVP pill and the dependency count only render when there's room to
  // read them; the health dot and the title itself always show.
  const showMvpBadge = feature.isMvp && width >= 100;
  const showMvpMark = feature.isMvp && width < 100;
  const showDependencyText = dependencyCount > 0 && width >= 90;

  return (
    <button
      type="button"
      onClick={props.onSelect}
      title={feature.title}
      style={{ left: props.left, width, height: ROW_HEIGHT_PX - 20 }}
      className={`absolute top-2.5 flex flex-col justify-center gap-1 overflow-hidden rounded-lg bg-white px-2.5 py-1 text-left shadow-sm ring-1 transition hover:ring-accent/40 ${
        feature.health ? HEALTH_BORDER[feature.health] : "border-l-4 border-neutral-300"
      } ${props.selected ? "ring-2 ring-accent" : "ring-neutral-200"}`}
    >
      <span className="flex min-w-0 items-center gap-1">
        {showMvpBadge && (
          <Badge variant="indigo" className="shrink-0 px-1.5 py-0 text-[10px]">
            MVP
          </Badge>
        )}
        {showMvpMark && (
          <span className="shrink-0 text-xs font-bold text-accent" aria-hidden title="MVP">
            ★
          </span>
        )}
        <span className="truncate text-xs font-semibold text-text-primary">{feature.title}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-text-muted">
        {feature.health && (
          <span
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[feature.health]}`}
            aria-hidden
            title={TIMELINE_HEALTH_LABELS[feature.health]}
          />
        )}
        {showDependencyText && (
          <span className="truncate">
            🔗 {dependencyCount} dependenc{dependencyCount === 1 ? "y" : "ies"}
          </span>
        )}
      </span>
    </button>
  );
}
