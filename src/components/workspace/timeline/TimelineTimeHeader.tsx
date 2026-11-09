"use client";

import type { TimeAxis } from "@/lib/roadmap/timelineScale";

/**
 * Sticky top time axis — a quarter-grouping row above a month row (§6). Month
 * labels only; no week/day precision ("this is strategic/product planning,
 * not day-level project scheduling" — product direction). The corner cell
 * stays sticky on both axes so it never scrolls out from under the frozen
 * left column.
 */
export default function TimelineTimeHeader(props: { axis: TimeAxis }) {
  const { axis } = props;

  return (
    <div className="roadmap-time-header sticky top-0 z-20 flex bg-white">
      <div
        className="sticky left-0 z-30 flex shrink-0 items-end border-b border-r border-border-subtle bg-white px-4 pb-2 text-sm font-bold"
        style={{ width: "var(--timeline-left-col)", height: "var(--timeline-header-height)" }}
      >Feature</div>
      <div style={{ width: axis.totalPx }}>
        <div className="flex border-b border-border-subtle" style={{ height: "var(--timeline-header-height)" }}>
          {axis.months.map((m) => {
            const days = Math.round((m.end.getTime() - m.start.getTime()) / 86_400_000) + 1;
            return (
              <div
                key={m.key}
                style={{ width: days * axis.pxPerDay }}
                className="flex shrink-0 items-center justify-center border-r border-border-subtle text-xs font-medium text-text-secondary"
              >
                {m.label.split(" ")[0]}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
