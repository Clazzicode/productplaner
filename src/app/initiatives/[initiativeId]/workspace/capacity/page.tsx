import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CapacityPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();

  const sprints = await db.sprint.findMany({
    where: { prototypeId: ws.prototype.id },
    orderBy: { sprintNumber: "asc" },
    include: { stories: { select: { points: true } } },
  });
  const forecast = computeCapacityForecast(sprints);
  const intake = ws.intakeView;

  const totalPlanned = forecast.reduce((n, f) => n + f.plannedPoints, 0);
  const totalCapacity = forecast.reduce((n, f) => n + f.capacityPoints, 0);

  return (
    <div>
      <h2 className="text-xl font-bold">Capacity forecast</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Computed live from the current sprint plan — never stored, never stale. Capacity ={" "}
        {intake.teamSize ?? "?"} people × {intake.velocityPerPersonPerSprint} pts/person/sprint ×{" "}
        {100 - intake.capacityBufferPercent}% (after {intake.capacityBufferPercent}% buffer).
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total planned" value={`${totalPlanned} pts`} />
        <StatCard label="Total capacity" value={`${totalCapacity.toFixed(1)} pts`} />
        <StatCard
          label="Overall utilization"
          value={`${totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0}%`}
        />
      </div>

      <div className="mt-8 space-y-3">
        {forecast.map((f) => {
          const pct = Math.min(100, (f.plannedPoints / Math.max(f.capacityPoints, 0.01)) * 100);
          const over = f.status === "over-allocated";
          return (
            <div key={f.sprintNumber} className="flex items-center gap-4">
              <span className="w-20 shrink-0 text-sm font-medium">Sprint {f.sprintNumber}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-neutral-100">
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
                className={`w-40 shrink-0 text-right text-xs ${
                  over ? "font-semibold text-red-600" : "text-neutral-500"
                }`}
              >
                {f.plannedPoints} / {f.capacityPoints.toFixed(1)} pts ({f.variancePercent > 0 ? "+" : ""}
                {f.variancePercent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
