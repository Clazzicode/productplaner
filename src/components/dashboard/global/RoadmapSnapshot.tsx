import Link from "next/link";
import { Badge, healthTokenVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HEALTH_LABELS } from "@/lib/generation/health";
import type { PrimaryInitiativeDetail } from "@/lib/dashboard/globalDashboardData";

/** Compact roadmap summary (Zone 1) — a lens over the same Prototype/
 * ArtifactLayer data as the full Roadmap workspace, not a copy of it. The
 * detailed capability-by-capability view stays in RoadmapTimeline on the
 * initiative dashboard; this is deliberately smaller for the dashboard grid. */
export default function RoadmapSnapshot(props: { primary: PrimaryInitiativeDetail | null }) {
  const p = props.primary;
  return (
    <Card>
      <CardTitle>Roadmap Snapshot</CardTitle>
      {!p ? (
        <EmptyState
          title="No roadmap yet"
          description="Generate an initiative's plan to see its roadmap here."
        />
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{p.name}</p>
            <Badge variant={healthTokenVariant(p.scheduleHealth)}>{HEALTH_LABELS[p.scheduleHealth]}</Badge>
          </div>
          <p className="text-xs text-neutral-500">{p.currentPhaseName}</p>
          <ProgressBar percent={p.completionPercent} />
          <p className="text-xs text-neutral-500">
            {p.nextMilestone
              ? `Next: ${p.nextMilestone.label} · ${p.nextMilestone.date.toLocaleDateString()}`
              : "No releases planned yet."}
          </p>
          <Link
            href={`/initiatives/${p.id}/workspace/roadmap`}
            className="inline-block text-xs font-medium text-indigo-600 hover:underline"
          >
            Open roadmap →
          </Link>
        </div>
      )}
    </Card>
  );
}
