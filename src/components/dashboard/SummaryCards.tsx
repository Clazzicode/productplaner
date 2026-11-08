import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/generation/health";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function SummaryCards(props: {
  completion: {
    stageLabel: string;
    nextAction: string;
    planningLabel?: string;
    commitmentLabel?: string;
  };
  scope: {
    total: number;
    mvp: number;
    deferred: number;
    baselineApprovedAt: Date | null;
  };
  forecast: {
    known?: boolean;
    sprints: number;
    releaseDate: Date | null;
    totalPoints: number;
    variancePercent: number;
    health: HealthStatus;
  };
  cost: {
    known?: boolean;
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
            Planning evidence and commitments
          </p>
          <p className="mt-2 text-sm font-medium">{completion.planningLabel ?? "Planning evidence unknown"}</p>
          <p className="mt-2 text-sm">{completion.commitmentLabel ?? "Delivery commitments unknown"}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Now: <span className="font-medium text-neutral-700">{completion.stageLabel}</span>
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
            {scope.baselineApprovedAt && (
              <>
                <br />
                Baseline approved {scope.baselineApprovedAt.toLocaleDateString()}
              </>
            )}
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Delivery forecast
          </p>
          <p className="mt-1 text-2xl font-bold">
            {forecast.known ? <>{forecast.sprints} <span className="text-base font-medium text-neutral-500">forecast sprints</span></> : "Unknown"}
          </p>
          {forecast.known && <p className="mt-2 text-xs text-neutral-500">
            {forecast.releaseDate && <>Forecast target: {forecast.releaseDate.toLocaleDateString()}<br /></>}
            Total: {forecast.totalPoints} points · capacity variance{" "}
            {forecast.variancePercent >= 0 ? "+" : ""}
            {forecast.variancePercent}%
          </p>}
          <div className="mt-2">
            {forecast.known ? <Badge variant={healthBadgeVariant(forecast.health)}>{HEALTH_LABELS[forecast.health]}</Badge> : <p className="text-xs text-neutral-500">Record estimates and capacity to build a forecast. This does not prevent manual planning.</p>}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Estimated cost
          </p>
          <p className="mt-1 text-2xl font-bold">{cost.known ? money(cost.total) : "Unknown"}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {cost.known ? <>{money(cost.perSprint)} per sprint · {money(cost.perPoint)} per story point</> : "Confirm team capacity, estimates and hourly rate before using a cost forecast."}
            {cost.known && cost.variancePercent != null && (
              <>
                <br />
                {cost.variancePercent > 0
                  ? `${cost.variancePercent}% above budget`
                  : `${Math.abs(cost.variancePercent)}% under budget`}
              </>
            )}
          </p>
          {cost.known && cost.health && (
            <div className="mt-2">
              <Badge variant={healthBadgeVariant(cost.health)}>{HEALTH_LABELS[cost.health]}</Badge>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
