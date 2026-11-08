import Link from "next/link";
import { Badge, healthTokenVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
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
      <CardTitle>Delivery outlook</CardTitle>
      {!p ? (
        <EmptyState
          title="No delivery outlook yet"
          description="Prepare an initiative's backlog foundation to see delivery context here."
        />
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{p.name}</p>
            {p.forecastKnown ? <Badge variant={healthTokenVariant(p.scheduleHealth)}>{HEALTH_LABELS[p.scheduleHealth]}</Badge> : <Badge variant="neutral">Forecast unknown</Badge>}
          </div>
          <p className="text-xs text-neutral-500">{p.currentPhaseName}</p>
          <p className="text-xs text-neutral-500">
            {p.nextMilestone
              ? `Planning target: ${p.nextMilestone.label} · ${p.nextMilestone.date.toLocaleDateString()}. Approval and commitment are separate.`
              : "Release forecast unknown. You can still inspect and develop the plan."}
          </p>
          <Link
            href={`/initiatives/${p.id}/workspace/sprint-preparation`}
            className="inline-block text-xs font-medium text-indigo-600 hover:underline"
          >
            Open sprint planning →
          </Link>
        </div>
      )}
    </Card>
  );
}
