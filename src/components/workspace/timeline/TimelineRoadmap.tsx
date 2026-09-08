"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import type { ClientRoadmapTimelineData } from "@/lib/roadmap/loadRoadmapTimelineData";
import { EMPTY_FILTERS, filterFeatures, type TimelineFilterState } from "@/lib/roadmap/timelineFilters";
import { buildTimeAxis, todayOffset, type ZoomLevel } from "@/lib/roadmap/timelineScale";
import { LEFT_COL_PX, ROW_HEIGHT_PX } from "./layout";
import RoadmapDetailDrawer from "./RoadmapDetailDrawer";
import RoadmapFilters from "./RoadmapFilters";
import TimelineMobileList from "./TimelineMobileList";
import TimelinePhaseGroup from "./TimelinePhaseGroup";
import TimelineTimeHeader from "./TimelineTimeHeader";
import UnscheduledFeatures from "./UnscheduledFeatures";

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/**
 * The Timeline view's root client component. Owns zoom/filter/selection UI
 * state only — it never mutates roadmap data (read-only for Step 9B, §"Do
 * Not Build Drag/Drop"). All Feature data arrives already-derived from the
 * server loader; this component does no Prisma/derivation work of its own.
 */
export default function TimelineRoadmap(props: { initiativeId: string; data: ClientRoadmapTimelineData }) {
  const { data } = props;
  const [zoom, setZoom] = useState<ZoomLevel>("year");
  const [filters, setFilters] = useState<TimelineFilterState>(EMPTY_FILTERS);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const axisStart = data.axisStart ? new Date(data.axisStart) : null;
  const axisEnd = data.axisEnd ? new Date(data.axisEnd) : null;
  const axis = useMemo(
    () => buildTimeAxis({ axisStart, axisEnd, zoom, today }),
    [axisStart?.getTime(), axisEnd?.getTime(), zoom, today],
  );
  const todayLeft = todayOffset(axis, today);

  // Scroll "today" into view on load/zoom change instead of leaving the
  // canvas at its default (often mostly-empty) scroll position — an axis
  // that spans many months would otherwise strand the current work off the
  // right edge on first paint.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todayLeft == null) return;
    el.scrollLeft = Math.max(0, LEFT_COL_PX + todayLeft - el.clientWidth / 3);
  }, [zoom, todayLeft]);

  const filteredPhases = data.phases.map((group) => ({
    ...group,
    features: filterFeatures(group.features, filters),
  }));
  const filteredUnscheduled = filterFeatures(data.unscheduled, filters);

  const totalCount = data.phases.reduce((n, p) => n + p.features.length, 0) + data.unscheduled.length;
  const matchCount =
    filteredPhases.reduce((n, p) => n + p.features.length, 0) + filteredUnscheduled.length;

  const allFeatures = [...data.phases.flatMap((p) => p.features), ...data.unscheduled];
  const selectedFeature = allFeatures.find((f) => f.id === selectedFeatureId) ?? null;

  if (!data.available) {
    return (
      <EmptyState
        title="Timeline isn't available for this methodology"
        description={data.unavailableReason ?? undefined}
      />
    );
  }

  if (totalCount === 0) {
    return (
      <EmptyState
        title="No roadmap Features yet"
        description="Generate this initiative's plan to see its Timeline here."
      />
    );
  }

  const rowsHeight = filteredPhases.reduce(
    (n, p) => n + (p.features.length > 0 ? p.features.length * ROW_HEIGHT_PX + 30 : 0),
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RoadmapFilters
          filters={filters}
          onChange={setFilters}
          phases={data.phases.map((p) => ({ phaseNumber: p.phaseNumber, name: p.name }))}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      </div>

      {/* Desktop/laptop/tablet: the real time-axis grid (§7/§20). Hidden below
          `sm` — it doesn't compress into anything readable at phone widths,
          so phones get TimelineMobileList instead, never a squeezed grid. */}
      <div className="hidden sm:block">
        <div className="mt-3 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
            {ZOOM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setZoom(opt.value)}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  zoom === opt.value
                    ? "bg-white text-accent shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {todayLeft != null && (
            <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="inline-block h-2 w-0.5 bg-accent" aria-hidden /> Today
            </p>
          )}
        </div>

        <div ref={scrollRef} className="mt-2 max-h-[70vh] overflow-auto rounded-xl border border-border-subtle">
          <TimelineTimeHeader axis={axis} />
          <div className="relative" style={{ width: LEFT_COL_PX + axis.totalPx }}>
            {todayLeft != null && (
              <div
                className="pointer-events-none absolute z-10 w-px bg-accent/40"
                style={{ left: LEFT_COL_PX + todayLeft, top: 0, height: rowsHeight }}
                aria-hidden
              />
            )}
            {filteredPhases.map((group) => (
              <TimelinePhaseGroup
                key={group.phaseNumber}
                group={group}
                axis={axis}
                selectedFeatureId={selectedFeatureId}
                onSelect={setSelectedFeatureId}
              />
            ))}
          </div>
        </div>

        <UnscheduledFeatures
          features={filteredUnscheduled}
          selectedFeatureId={selectedFeatureId}
          onSelect={setSelectedFeatureId}
        />

        {matchCount === 0 && totalCount > 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-text-muted">
            No Features match the current filters.
          </p>
        )}
      </div>

      {/* Mobile: simplified read-only list, same data/filters/drawer. */}
      <div className="mt-3 sm:hidden">
        <TimelineMobileList
          phases={filteredPhases}
          unscheduled={filteredUnscheduled}
          onSelect={setSelectedFeatureId}
        />
      </div>

      <RoadmapDetailDrawer
        feature={selectedFeature}
        initiativeId={props.initiativeId}
        onClose={() => setSelectedFeatureId(null)}
      />
    </div>
  );
}
