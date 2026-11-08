import Link from "next/link";
import { Badge, healthTokenVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { planningLabel, commitmentLabel } from "@/lib/planning/readiness";
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
          title="No planning workspace yet"
          description="Save an initiative draft or open an existing initiative to start planning."
        />
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            {p.forecastKnown ? <Badge variant={healthTokenVariant(p.scheduleHealth)}>{HEALTH_LABELS[p.scheduleHealth]}</Badge> : <Badge variant="neutral">Forecast unknown</Badge>}
          </div>
          <p className="mt-2 text-sm">Planning: {p.planningEvidence ? planningLabel(p.planningEvidence) : "Evidence unknown"}</p>
          <p className="mt-2 text-sm">Delivery: {p.planningEvidence ? commitmentLabel(p.planningEvidence) : "Commitments unknown"}</p>
          {p.planningEvidence && <p className="mt-2 text-xs text-neutral-500">{p.planningEvidence.missingContext.length ? `Context to develop: ${p.planningEvidence.missingContext.join(", ")}.` : "Problem, customer and outcome recorded."} Generation is optional; readiness checks apply when you request an action.</p>}
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
