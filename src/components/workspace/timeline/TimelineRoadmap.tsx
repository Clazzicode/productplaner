"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { formatCalendarDate } from "@/lib/calendarDate";
import type { ClientRoadmapTimelineData } from "@/lib/roadmap/loadRoadmapTimelineData";
import { EMPTY_FILTERS, filterFeatures, type TimelineFilterState } from "@/lib/roadmap/timelineFilters";
import { buildTimeAxis, markerOffset, todayOffset, type ZoomLevel } from "@/lib/roadmap/timelineScale";
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
  const [search, setSearch] = useState("");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(data.phases.flatMap((group) => group.features)[0]?.id ?? data.unscheduled[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const today = useMemo(() => new Date(), []);
  const axis = useMemo(
    () => buildTimeAxis({ axisStart: data.axisStart ? new Date(data.axisStart) : null, axisEnd: data.axisEnd ? new Date(data.axisEnd) : null, zoom, today }),
    [data.axisStart, data.axisEnd, zoom, today],
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
    features: filterFeatures(group.features, filters).filter((feature) => feature.title.toLowerCase().includes(search.trim().toLowerCase())),
  }));
  const filteredUnscheduled = filterFeatures(data.unscheduled, filters).filter((feature) => feature.title.toLowerCase().includes(search.trim().toLowerCase()));

  const totalCount = data.phases.reduce((n, p) => n + p.features.length, 0) + data.unscheduled.length;
  const matchCount =
    filteredPhases.reduce((n, p) => n + p.features.length, 0) + filteredUnscheduled.length;

  const allFeatures = [...data.phases.flatMap((p) => p.features), ...data.unscheduled];
  const selectedFeature = allFeatures.find((f) => f.id === selectedFeatureId) ?? null;
  const cadenceLabels: Record<string, string> = {
    weekly: "Weekly", biweekly: "Every two weeks", every_three_weeks: "Every three weeks",
    monthly: "Monthly", quarterly: "Quarterly",
  };

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
    <div className="roadmap-stage roadmap-timeline-stage">
      <div className="roadmap-stage-main">
      {data.releases.length > 0 && <section className="roadmap-cadence-strip" aria-label="Release cadence and target dates">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-semibold text-indigo-950">Release cadence</h3>
            <p className="text-xs text-indigo-700">{(cadenceLabels[data.releases[0].cadence] ?? data.releases[0].cadence) || "Not set"}</p></div>
          <div className="flex flex-wrap gap-2">{data.releases.map((release) => <span key={release.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 ring-1 ring-indigo-100">
            {release.label} · {formatCalendarDate(release.targetDate, { month: "short", day: "numeric", year: "numeric" })}
            <span className="ml-1 text-indigo-600">· {release.featureCount} features · {release.defectCount} defects · {release.blockerCount} blockers · {release.qualityRisk} risk</span>
          </span>)}</div>
        </div>
      </section>}
      <div className="roadmap-controls roadmap-timeline-controls">
        <label className="roadmap-search"><span aria-hidden>⌕</span><span className="sr-only">Search timeline features</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search features..." /></label>
        <RoadmapFilters
          filters={filters}
          onChange={setFilters}
          phases={data.phases.map((p) => ({ phaseNumber: p.phaseNumber, name: p.name }))}
          matchCount={matchCount}
          totalCount={totalCount}
        />
        <div className="roadmap-zoom hidden sm:inline-flex" aria-label="Timeline zoom">
          {ZOOM_OPTIONS.map((opt) => <button key={opt.value} type="button" onClick={() => setZoom(opt.value)} className={zoom === opt.value ? "is-active" : ""}>{opt.label}</button>)}
        </div>
      </div>

      {/* Desktop/laptop/tablet: the real time-axis grid (§7/§20). Hidden below
          `sm` — it doesn't compress into anything readable at phone widths,
          so phones get TimelineMobileList instead, never a squeezed grid. */}
      <div className="hidden sm:block">
        <div ref={scrollRef} className="roadmap-timeline-canvas mt-2 max-h-[70vh] overflow-auto rounded-xl border border-border-subtle">
          <TimelineTimeHeader axis={axis} />
          <div className="relative" style={{ width: LEFT_COL_PX + axis.totalPx }}>
            {todayLeft != null && (
              <div
                className="pointer-events-none absolute z-10 w-px bg-accent/40"
                style={{ left: LEFT_COL_PX + todayLeft, top: 0, height: rowsHeight }}
                aria-hidden
              ><span className="absolute -top-5 left-0 rounded bg-[#5145ed] px-1.5 py-0.5 text-[10px] font-semibold text-white">Today</span></div>
            )}
            {data.releases.map((release) => {
              const left = markerOffset(axis, new Date(release.targetDate));
              if (left == null) return null;
              return <div key={release.id} className="pointer-events-none absolute z-10 border-l border-dashed border-indigo-500/70" style={{ left: LEFT_COL_PX + left, top: 0, height: rowsHeight }} aria-hidden>
                <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{release.label}</span>
              </div>;
            })}
            {filteredPhases.map((group) => (
              <TimelinePhaseGroup
                key={group.phaseNumber}
                group={group}
                axis={axis}
                selectedFeatureId={selectedFeatureId}
                onSelect={(id) => { setSelectedFeatureId(id); setMobileOpen(true); }}
              />
            ))}
          </div>
        </div>

        <UnscheduledFeatures
          features={filteredUnscheduled}
          selectedFeatureId={selectedFeatureId}
          onSelect={(id) => { setSelectedFeatureId(id); setMobileOpen(true); }}
        />

        {matchCount === 0 && totalCount > 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-text-muted">
            No Features match the current filters.
          </p>
        )}
      </div>

      <div className="roadmap-timeline-legend"><span><i className="is-solid" /> From sprint dates</span><span><i className="is-estimate" /> Phase estimate</span><span className="roadmap-timeline-note">ⓘ Dates are estimates for planning and may change.</span></div>

      {/* Mobile: simplified read-only list, same data/filters/drawer. */}
      <div className="mt-3 sm:hidden">
        <TimelineMobileList
          phases={filteredPhases}
          unscheduled={filteredUnscheduled}
          selectedFeatureId={selectedFeatureId}
          onSelect={(id) => { setSelectedFeatureId(id); setMobileOpen(true); }}
        />
      </div>

      </div>
      <RoadmapDetailDrawer
        feature={selectedFeature}
        initiativeId={props.initiativeId}
        onClose={() => { setMobileOpen(false); setSelectedFeatureId(null); }}
        roadmap
        mobileOpen={mobileOpen}
      />
    </div>
  );
}
