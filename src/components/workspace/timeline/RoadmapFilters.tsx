"use client";

import Select from "@/components/ui/Select";
import { RISK_LABELS, VALUE_LABELS } from "@/lib/generation/constants";
import { isFilterActive, type TimelineFilterState } from "@/lib/roadmap/timelineFilters";

/**
 * Compact CRM-style filter row — only fields backed by real, existing data
 * (§10/docs/V2-ROADMAP-ARCHITECTURE.md §2): MVP, business value, risk, phase.
 * No Team/Owner/Status — that data doesn't exist on a Feature yet.
 */
export default function RoadmapFilters(props: {
  filters: TimelineFilterState;
  onChange: (next: TimelineFilterState) => void;
  phases: { phaseNumber: number; name: string }[];
  matchCount: number;
  totalCount: number;
}) {
  const { filters, onChange } = props;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Filter</span>

      <button
        type="button"
        onClick={() => onChange({ ...filters, mvpOnly: !filters.mvpOnly })}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          filters.mvpOnly
            ? "border-accent bg-accent/10 text-accent"
            : "border-neutral-300 bg-white text-text-secondary hover:bg-neutral-50"
        }`}
      >
        MVP only
      </button>

      <Select
        aria-label="Filter by business value"
        className="w-auto"
        value={filters.businessValue ?? ""}
        onChange={(e) => onChange({ ...filters, businessValue: e.target.value || null })}
      >
        <option value="">All value</option>
        {Object.entries(VALUE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label} value
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by risk level"
        className="w-auto"
        value={filters.riskLevel ?? ""}
        onChange={(e) => onChange({ ...filters, riskLevel: e.target.value || null })}
      >
        <option value="">All risk</option>
        {Object.entries(RISK_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label} risk
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by phase"
        className="w-auto"
        value={filters.phaseNumber != null ? String(filters.phaseNumber) : ""}
        onChange={(e) => onChange({ ...filters, phaseNumber: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">All phases</option>
        {props.phases.map((p) => (
          <option key={p.phaseNumber} value={p.phaseNumber}>
            {p.name}
          </option>
        ))}
      </Select>

      {isFilterActive(filters) && (
        <button
          type="button"
          onClick={() =>
            onChange({ mvpOnly: false, businessValue: null, riskLevel: null, phaseNumber: null })
          }
          className="text-xs font-medium text-accent hover:underline"
        >
          Clear filters
        </button>
      )}

      <span className="ml-auto text-xs text-text-muted">
        {props.matchCount} of {props.totalCount} features
      </span>
    </div>
  );
}
