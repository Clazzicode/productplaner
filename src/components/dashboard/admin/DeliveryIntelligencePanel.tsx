import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { DeliveryIntelligence } from "@/lib/dashboard/adminDashboardData";

/** Delivery signals across the whole portfolio (docs/V2-ORG-ADMIN-DASHBOARD.md
 * §10) — reuses the exact same scheduleHealth/computeCapacityForecast the
 * initiative dashboard already computes, aggregated org-wide. No new
 * delivery-scoring engine. */
export default function DeliveryIntelligencePanel(props: { data: DeliveryIntelligence }) {
  const d = props.data;
  return (
    <Card>
      <CardTitle>Delivery Intelligence</CardTitle>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-xs text-text-muted">At-risk initiatives</p>
          <p className={`mt-1 text-xl font-bold ${d.atRiskInitiatives > 0 ? "text-health-critical" : "text-text-primary"}`}>
            {d.atRiskInitiatives}
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-xs text-text-muted">Over-allocated sprints</p>
          <p className={`mt-1 text-xl font-bold ${d.overAllocatedSprints > 0 ? "text-health-attention" : "text-text-primary"}`}>
            {d.overAllocatedSprints}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Approaching launch</p>
      {d.approachingLaunch.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="Nothing scheduled" description="No initiative has an upcoming target launch date." />
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {d.approachingLaunch.map((l) => (
            <li key={l.name} className="flex items-center justify-between text-sm">
              <Link href={l.href} className="text-neutral-800 hover:text-indigo-700 hover:underline">
                {l.name}
              </Link>
              <span className="text-xs text-text-muted">{l.date.toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
