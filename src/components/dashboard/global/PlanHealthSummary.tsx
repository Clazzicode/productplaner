import Link from "next/link";
import { Badge, healthTokenVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HEALTH_LABELS } from "@/lib/generation/health";
import type { PrimaryInitiativeDetail } from "@/lib/dashboard/globalDashboardData";

/** Compact plan-health module (Zone 1). Reuses the exact schedule-health value
 * computed in globalDashboardData.ts — the same scheduleHealth() thresholds
 * the initiative dashboard uses, not a second calculation. */
export default function PlanHealthSummary(props: { primary: PrimaryInitiativeDetail | null }) {
  const p = props.primary;
  return (
    <Card>
      <CardTitle>Plan Health</CardTitle>
      {!p ? (
        <EmptyState
          title="No generated plan yet"
          description="Plan health appears once an initiative's guided intake is generated."
        />
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <Badge variant={healthTokenVariant(p.scheduleHealth)}>{HEALTH_LABELS[p.scheduleHealth]}</Badge>
            <span className="text-xs text-neutral-500">{p.completionPercent}% complete</span>
          </div>
          <ProgressBar percent={p.completionPercent} className="mt-2" />
          <p className="mt-2 text-xs text-neutral-500">{p.stageLabel}</p>
          <Link
            href={`/initiatives/${p.id}/dashboard`}
            className="mt-3 inline-block text-xs font-medium text-indigo-600 hover:underline"
          >
            Open {p.name} →
          </Link>
        </div>
      )}
    </Card>
  );
}
