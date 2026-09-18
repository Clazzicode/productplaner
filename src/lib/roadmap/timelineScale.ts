// Pure time-axis math for the Timeline canvas (Step 9B, docs/V2-ROADMAP-TIMELINE.md
// §6/§7). Quarter/Year zoom changes pixel density only — the axis always spans
// the full range of scheduled work; horizontal scroll is how a user moves
// through it (no month zoom, no calendar engine, no quarter-to-quarter nav).

import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";

export type ZoomLevel = "quarter" | "year";

// "Wider time cells" (quarter) vs "more compressed blocks" (year) — the exact
// language from the product direction — is just a bigger/smaller px-per-day.
// year=9 keeps a typical 2-week Sprint-driven block (~126px) wide enough to
// read a short title before it truncates — 6px/day left most blocks reading
// as "MVP A…" (Step 9B browser QA finding).
export const PX_PER_DAY: Record<ZoomLevel, number> = { year: 9, quarter: 20 };

export const MIN_BLOCK_PX = 56;

export interface AxisMonth {
  key: string; // yyyy-MM
  label: string; // "Jan"
  start: Date;
  end: Date;
  quarterKey: string; // "2026-Q1" — every month has one, so the header can group consecutive months
  quarterLabel: string; // "Q1 2026"
}

export interface TimeAxis {
  rangeStart: Date;
  rangeEnd: Date;
  months: AxisMonth[];
  totalDays: number;
  pxPerDay: number;
  totalPx: number;
}

/**
 * Builds a month-aligned axis covering [axisStart, axisEnd], padded to at
 * least a 3-month span so an initiative with very little scheduled work
 * doesn't render a degenerate one-column axis. When there's no scheduled
 * data at all, anchors on `today` so the grid still renders something real
 * (today's month), never a fabricated project range.
 */
export function buildTimeAxis(args: {
  axisStart: Date | null;
  axisEnd: Date | null;
  zoom: ZoomLevel;
  today: Date;
}): TimeAxis {
  const fallback = startOfMonth(args.today);
  const start = startOfMonth(args.axisStart ?? fallback);
  let end = endOfMonth(args.axisEnd ?? addMonths(fallback, 2));
  const minEnd = endOfMonth(addMonths(start, 2));
  if (end < minEnd) end = minEnd;

  const months: AxisMonth[] = [];
  let cursor = start;
  while (cursor <= end) {
    const mStart = startOfMonth(cursor);
    const mEnd = endOfMonth(cursor);
    const quarterNumber = Math.floor(mStart.getMonth() / 3) + 1;
    months.push({
      key: format(mStart, "yyyy-MM"),
      label: format(mStart, "MMM yyyy"),
      start: mStart,
      end: mEnd,
      quarterKey: `${mStart.getFullYear()}-Q${quarterNumber}`,
      quarterLabel: `Q${quarterNumber} ${mStart.getFullYear()}`,
    });
    cursor = addMonths(cursor, 1);
  }

  const totalDays = differenceInCalendarDays(end, start) + 1;
  const pxPerDay = PX_PER_DAY[args.zoom];
  return { rangeStart: start, rangeEnd: end, months, totalDays, pxPerDay, totalPx: totalDays * pxPerDay };
}

/** Left offset + width (px) for a block spanning [start, end] on this axis. */
export function blockPosition(axis: TimeAxis, start: Date, end: Date): { left: number; width: number } {
  const clampedStart = start < axis.rangeStart ? axis.rangeStart : start;
  const left = Math.max(0, differenceInCalendarDays(clampedStart, axis.rangeStart)) * axis.pxPerDay;
  const spanDays = Math.max(1, differenceInCalendarDays(end, clampedStart) + 1);
  const width = Math.max(MIN_BLOCK_PX, spanDays * axis.pxPerDay);
  return { left, width };
}

/** Left offset (px) of "today" on this axis, or null when today falls outside it. */
export function todayOffset(axis: TimeAxis, today: Date): number | null {
  if (today < axis.rangeStart || today > axis.rangeEnd) return null;
  return differenceInCalendarDays(today, axis.rangeStart) * axis.pxPerDay;
}
