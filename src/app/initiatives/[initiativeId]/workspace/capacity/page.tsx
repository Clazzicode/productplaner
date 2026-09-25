import { notFound } from "next/navigation";
import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import AssumptionsEditor from "@/components/workspace/AssumptionsEditor";
import PlanningWeightsEditor from "@/components/workspace/PlanningWeightsEditor";
import { getResolvedAccess } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { PROTOTYPE_DISCLAIMER } from "@/lib/generation/constants";
import { costHealth, HEALTH_LABELS, scheduleHealth } from "@/lib/generation/health";
import { canEditPlanningWeights } from "@/lib/planningWeights/permissions";
import { getWeightConfigurationView } from "@/lib/planningWeights/planningWeights";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function CapacityPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();

  const [sprints, cost, intakeRow, qualifyingProfile, resolvedAccess, weightSets] = await Promise.all([
    db.sprint.findMany({
      where: { prototypeId: ws.prototype.id },
      orderBy: { sprintNumber: "asc" },
      include: { stories: { select: { points: true } } },
    }),
    loadCostContext(initiativeId, ws.prototype.id),
    db.intakeAnswerSet.findUniqueOrThrow({ where: { initiativeId } }),
    db.initiative
      .findUnique({ where: { id: initiativeId }, select: { qualifyingProfile: { select: { experienceLevel: true } } } })
      .then((i) => i?.qualifyingProfile ?? null),
    getResolvedAccess(user, initiativeId),
    getWeightConfigurationView(initiativeId),
  ]);
  const forecast = computeCapacityForecast(sprints);
  const model = cost.model;
  const initiativePermission = resolvedAccess === "not_found" ? "none" : resolvedAccess.level;
  const canEditWeights = canEditPlanningWeights({
    actorStatus: user.status,
    accessLevel: user.accessLevel,
    initiativePermission,
    initiativeExperienceLevel: qualifyingProfile?.experienceLevel ?? null,
  });

  const totalPlanned = forecast.reduce((n, f) => n + f.plannedPoints, 0);
  const totalCapacity = forecast.reduce((n, f) => n + f.capacityPoints, 0);
  const schedule = forecast.some((f) => f.status === "over-allocated")
    ? "at_risk"
    : scheduleHealth(totalPlanned, totalCapacity);
  const costStatus = costHealth(model.estimatedInitiativeCost, model.budget);

  return (
    <div>
      <h2 className="text-xl font-bold">Capacity &amp; cost</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Computed live from the current sprint plan — never stored, never stale.{" "}
        {model.usingHoursModel
          ? `Capacity = ${intakeRow.teamSize ?? "?"} people × ${intakeRow.hoursPerSprintPerMember} hrs × ${intakeRow.utilizationRatePercent}% utilization − ${intakeRow.capacityBufferPercent}% buffer ÷ ${intakeRow.hoursPerStoryPoint} hrs/point = ${model.sprintPointCapacity} points/sprint.`
          : `Capacity = ${intakeRow.teamSize ?? "?"} people × ${intakeRow.velocityPerPersonPerSprint} pts/person/sprint × ${100 - intakeRow.capacityBufferPercent}%.`}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total planned" value={`${totalPlanned} pts`} />
        <StatCard label="Total capacity" value={`${totalCapacity.toFixed(1)} pts`} />
        <StatCard
          label="Overall utilization"
          value={`${totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0}%`}
          badge={<Badge variant={healthBadgeVariant(schedule)}>{HEALTH_LABELS[schedule]}</Badge>}
        />
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Cost model (§17–§24)
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sprint labor cost" value={money(model.sprintLaborCost)} sub={`${Math.round(model.availableTeamHours)} hrs × $${model.averageHourlyRate}/hr`} />
        <StatCard label="Cost per story point" value={money(model.costPerStoryPoint)} sub={`${money(model.sprintLaborCost)} ÷ ${model.sprintPointCapacity} pts`} />
        <StatCard label="Planned work cost" value={money(model.plannedWorkCost)} sub={`${model.totalPlannedPoints} pts × ${money(model.costPerStoryPoint)}`} />
        <StatCard label="Estimated initiative cost" value={money(model.estimatedInitiativeCost)} sub={`${model.totalSprints} sprints × ${money(model.sprintLaborCost)}`} />
        <StatCard label="Unused capacity cost" value={money(model.unusedCapacityCost)} sub="allocated − planned work" />
        {model.budget != null && model.budgetVariance ? (
          <StatCard
            label="Budget variance"
            value={`${model.budgetVariance.amount >= 0 ? "+" : "−"}${money(Math.abs(model.budgetVariance.amount))}`}
            sub={`${model.budgetVariance.percent}% vs ${money(model.budget)} budget`}
            badge={
              costStatus ? (
                <Badge variant={healthBadgeVariant(costStatus)}>{HEALTH_LABELS[costStatus]}</Badge>
              ) : undefined
            }
          />
        ) : (
          <StatCard label="Budget variance" value="—" sub="Set a budget below to compare" />
        )}
      </div>

      <div className="mt-8">
        <AssumptionsEditor
          initiativeId={initiativeId}
          values={{
            averageHourlyRate: model.averageHourlyRate,
            budget: model.budget,
            utilizationRatePercent: intakeRow.utilizationRatePercent,
            capacityBufferPercent: intakeRow.capacityBufferPercent,
            hoursPerStoryPoint: intakeRow.hoursPerStoryPoint,
            hoursPerSprintPerMember: intakeRow.hoursPerSprintPerMember,
            historicalVelocityPoints: intakeRow.historicalVelocityPoints,
          }}
        />
      </div>

      {canEditWeights && (
        <div className="mt-8">
          <PlanningWeightsEditor initiativeId={initiativeId} sets={weightSets} />
        </div>
      )}

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Sprint-by-sprint forecast
      </h3>
      <div className="mt-3 space-y-3">
        {forecast.map((f) => {
          const pct = Math.min(100, (f.plannedPoints / Math.max(f.capacityPoints, 0.01)) * 100);
          const over = f.status === "over-allocated";
          return (
            <div key={f.sprintNumber} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-20 shrink-0 text-sm font-medium">Sprint {f.sprintNumber}</span>
              <div className="h-5 min-w-24 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`flex h-full items-center rounded-full px-2 text-[10px] font-semibold text-white ${
                    over ? "bg-red-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.max(pct, 8)}%` }}
                >
                  {f.plannedPoints}
                </div>
              </div>
              <span
                className={`w-full pl-24 text-right text-xs sm:w-56 sm:shrink-0 sm:pl-0 ${
                  over ? "font-semibold text-red-600" : "text-neutral-500"
                }`}
              >
                {f.plannedPoints} / {f.capacityPoints.toFixed(1)} pts ({f.variancePercent > 0 ? "+" : ""}
                {f.variancePercent}%) · {money(f.plannedPoints * model.costPerStoryPoint)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-8 rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
        {PROTOTYPE_DISCLAIMER}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
      {badge && <div className="mt-1.5">{badge}</div>}
    </div>
  );
}
