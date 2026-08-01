import ExplainCallout from "@/components/demo/ExplainCallout";
import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/generation/health";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function SummaryCards(props: {
  completion: {
    percent: number;
    lockedCount: number;
    totalLayers: number;
    activeLayer: string | null;
    nextAction: string;
  };
  scope: {
    total: number;
    mvp: number;
    deferred: number;
    baselineApprovedAt: Date | null;
  };
  forecast: {
    sprints: number;
    releaseDate: Date | null;
    totalPoints: number;
    variancePercent: number;
    health: HealthStatus;
  };
  cost: {
    total: number;
    perSprint: number;
    perPoint: number;
    variancePercent: number | null;
    health: HealthStatus | null;
  };
}) {
  const { completion, scope, forecast, cost } = props;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Plan completion
          </p>
          <p className="mt-1 text-2xl font-bold">{completion.percent}%</p>
          <ProgressBar percent={completion.percent} className="mt-2" />
          <p className="mt-2 text-xs text-neutral-500">
            {completion.lockedCount} of {completion.totalLayers} planning layers locked
            {completion.activeLayer && (
              <>
                <br />
                Current: <span className="font-medium text-neutral-700">{completion.activeLayer}</span>
              </>
            )}
            <br />
            Next: {completion.nextAction}
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">MVP scope</p>
          <p className="mt-1 text-2xl font-bold">
            {scope.total} <span className="text-base font-medium text-neutral-500">capabilities</span>
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            <span className="font-medium text-indigo-700">{scope.mvp} MVP</span> ·{" "}
            {scope.deferred} future release
            <br />
            {scope.baselineApprovedAt
              ? `Baseline approved ${scope.baselineApprovedAt.toLocaleDateString()}`
              : "Baseline not approved yet — lock all five layers"}
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Delivery forecast
          </p>
          <p className="mt-1 text-2xl font-bold">
            {forecast.sprints} <span className="text-base font-medium text-neutral-500">sprints</span>
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {forecast.releaseDate && <>Target release: {forecast.releaseDate.toLocaleDateString()}<br /></>}
            Total: {forecast.totalPoints} points · capacity variance{" "}
            {forecast.variancePercent >= 0 ? "+" : ""}
            {forecast.variancePercent}%
          </p>
          <div className="mt-2">
            <Badge variant={healthBadgeVariant(forecast.health)}>{HEALTH_LABELS[forecast.health]}</Badge>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Estimated cost
          </p>
          <p className="mt-1 text-2xl font-bold">{money(cost.total)}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {money(cost.perSprint)} per sprint · {money(cost.perPoint)} per story point
            {cost.variancePercent != null && (
              <>
                <br />
                {cost.variancePercent > 0
                  ? `${cost.variancePercent}% above budget`
                  : `${Math.abs(cost.variancePercent)}% under budget`}
              </>
            )}
          </p>
          {cost.health && (
            <div className="mt-2">
              <Badge variant={healthBadgeVariant(cost.health)}>{HEALTH_LABELS[cost.health]}</Badge>
            </div>
          )}
        </Card>
      </div>
      <ExplainCallout>
        These four cards answer: where is the plan, how complete is it, is it realistic, and what
        does it cost? Every number is computed live from your intake answers, the generated plan,
        and labeled prototype assumptions — nothing is typed in by hand.
      </ExplainCallout>
    </div>
  );
}
