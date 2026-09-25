"use client";

import type { AxisMonth, TimeAxis } from "@/lib/roadmap/timelineScale";
import { LEFT_COL_PX, MONTH_ROW_PX, QUARTER_ROW_PX } from "./layout";

interface QuarterCell {
  key: string;
  label: string;
  widthPx: number;
}

function groupByQuarter(months: AxisMonth[], pxPerDay: number): QuarterCell[] {
  const cells: QuarterCell[] = [];
  for (const m of months) {
    const days = Math.round((m.end.getTime() - m.start.getTime()) / 86_400_000) + 1;
    const widthPx = days * pxPerDay;
    const last = cells[cells.length - 1];
    if (last && last.key === m.quarterKey) {
      last.widthPx += widthPx;
    } else {
      cells.push({ key: m.quarterKey, label: m.quarterLabel, widthPx });
    }
  }
  return cells;
}

/**
 * Sticky top time axis — a quarter-grouping row above a month row (§6). Month
 * labels only; no week/day precision ("this is strategic/product planning,
 * not day-level project scheduling" — product direction). The corner cell
 * stays sticky on both axes so it never scrolls out from under the frozen
 * left column.
 */
export default function TimelineTimeHeader(props: { axis: TimeAxis }) {
  const { axis } = props;
  const quarters = groupByQuarter(axis.months, axis.pxPerDay);

  return (
    <div className="sticky top-0 z-20 flex bg-white">
      <div
        className="sticky left-0 z-30 shrink-0 border-b border-r border-border-subtle bg-white"
        style={{ width: LEFT_COL_PX, height: QUARTER_ROW_PX + MONTH_ROW_PX }}
      />
      <div style={{ width: axis.totalPx }}>
        <div className="flex border-b border-border-subtle" style={{ height: QUARTER_ROW_PX }}>
          {quarters.map((q) => (
            <div
              key={q.key}
              style={{ width: q.widthPx }}
              className="flex shrink-0 items-center justify-center border-r border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-text-muted"
            >
              {q.label}
            </div>
          ))}
        </div>
        <div className="flex border-b border-border-subtle" style={{ height: MONTH_ROW_PX }}>
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
