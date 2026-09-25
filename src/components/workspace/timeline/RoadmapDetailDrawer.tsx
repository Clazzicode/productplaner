"use client";

import { format } from "date-fns";
import Link from "next/link";
import { Badge, riskBadgeVariant, timelineHealthTokenVariant, valueBadgeVariant } from "@/components/ui/Badge";
import type { BusinessValue, RiskLevel } from "@/lib/generation/types";
import { businessValueGuidance, riskLevelGuidance } from "@/lib/questionnaire/valueRiskGuidance";
import type { ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";
import { TIMELINE_HEALTH_LABELS } from "@/lib/roadmap/timelineDerivation";

const SCHEDULE_SOURCE_LABEL: Record<ClientTimelineFeature["scheduleSource"], string> = {
  sprints: "From its Stories' Sprint dates",
  phase_range: "From this phase's throughput-packed range (Kanban)",
  unscheduled: "Not yet schedulable",
};

/**
 * Right-side drawer on desktop, full-width sheet on narrow viewports (§
 * "Detail Panel Behavior"). Read-only — no scheduling edit affordances exist
 * here or anywhere in Step 9B; every field below is either read directly or
 * derived at request time, never fabricated (owner/team are honestly
 * omitted rather than guessed — that data doesn't exist yet).
 */
export default function RoadmapDetailDrawer(props: {
  feature: ClientTimelineFeature | null;
  initiativeId: string;
  onClose: () => void;
}) {
  const { feature } = props;
  if (!feature) return null;

  const start = feature.start ? new Date(feature.start) : null;
  const end = feature.end ? new Date(feature.end) : null;
  const releaseDate = feature.releaseTargetDate ? new Date(feature.releaseTargetDate) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-neutral-900/40" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={feature.title}
        className="flex h-full w-full flex-col overflow-y-auto bg-white shadow-xl sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{feature.phaseName}</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-text-primary">{feature.title}</h2>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 p-5">
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              {feature.isMvp && <Badge variant="indigo">MVP</Badge>}
              <Badge
                variant={valueBadgeVariant(feature.businessValue)}
                title={businessValueGuidance(feature.businessValue as BusinessValue, false)}
              >
                {feature.businessValue.replace("_", " ")} value
              </Badge>
              {feature.riskLevel && (
                <Badge
                  variant={riskBadgeVariant(feature.riskLevel)}
                  title={riskLevelGuidance(feature.riskLevel as RiskLevel, false)}
                >
                  risk {feature.riskLevel}
                </Badge>
              )}
              {feature.health && (
                <Badge variant={timelineHealthTokenVariant(feature.health)}>
                  {TIMELINE_HEALTH_LABELS[feature.health]}
                </Badge>
              )}
            </div>
            {feature.description && <p className="mt-3 text-sm text-text-secondary">{feature.description}</p>}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Timing</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Phase" value={feature.phaseName} />
              <Row
                label="Derived start"
                value={start ? format(start, "MMM d, yyyy") : "—"}
              />
              <Row label="Derived end" value={end ? format(end, "MMM d, yyyy") : "—"} />
              <Row label="Basis" value={SCHEDULE_SOURCE_LABEL[feature.scheduleSource]} />
              {feature.releaseName && (
                <Row
                  label="Release"
                  value={releaseDate ? `${feature.releaseName} · ${format(releaseDate, "MMM d, yyyy")}` : feature.releaseName}
                />
              )}
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Dependencies</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row
                label="Depends on"
                value={feature.dependsOnNames.length > 0 ? feature.dependsOnNames.join(", ") : "None"}
              />
              <Row
                label="Depended on by"
                value={feature.dependedOnByNames.length > 0 ? feature.dependedOnByNames.join(", ") : "None"}
              />
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Delivery</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Epics" value={String(feature.epicCount)} />
              <Row label="Stories" value={String(feature.storyCount)} />
              <Row label="Sprint span" value={feature.sprintRange ?? "Not yet packed"} />
            </dl>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border-subtle p-5">
          <Link
            href={`/initiatives/${props.initiativeId}/workspace/features`}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-neutral-50"
          >
            Open Feature Hierarchy
          </Link>
          <Link
            href={`/initiatives/${props.initiativeId}/workspace/epics`}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-neutral-50"
          >
            View Epics &amp; Stories
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-text-muted">{props.label}</dt>
      <dd className="text-right text-text-primary">{props.value}</dd>
    </div>
  );
}
