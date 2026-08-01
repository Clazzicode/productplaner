import Link from "next/link";
import ExplainCallout from "@/components/demo/ExplainCallout";
import { Card, CardTitle } from "@/components/ui/Card";
import type { CostModel } from "@/lib/generation/cost";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Dashboard shows the result only — the full model lives in Capacity & Cost (spec §1.7). */
export default function CapacityCostPanel(props: {
  initiativeId: string;
  teamSize: number | null;
  model: CostModel;
}) {
  const m = props.model;
  const rows: [string, string][] = [
    ["Team size", `${props.teamSize ?? "?"} people`],
    ["Available hours / sprint", `${Math.round(m.availableTeamHours)} hrs`],
    ["Usable after buffer", `${Math.round(m.usableTeamHours)} hrs`],
    ["Sprint capacity", `${m.sprintPointCapacity} points`],
    ["Cost per sprint", money(m.sprintLaborCost)],
    ["Cost per story point", money(m.costPerStoryPoint)],
    ["Planned work cost", money(m.plannedWorkCost)],
    ["Estimated initiative cost", money(m.estimatedInitiativeCost)],
  ];
  if (m.budget != null && m.budgetVariance) {
    rows.push([
      "Budget variance",
      `${m.budgetVariance.amount >= 0 ? "+" : "−"}${money(Math.abs(m.budgetVariance.amount))} (${m.budgetVariance.percent}%)`,
    ]);
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Capacity &amp; cost</CardTitle>
        <Link
          href={`/initiatives/${props.initiativeId}/workspace/capacity`}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Full model →
        </Link>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-neutral-400">
        Estimated from configurable prototype assumptions ($
        {m.averageHourlyRate}/hr, {m.usingHoursModel ? "hours-based capacity" : "legacy points capacity"}).
      </p>
      <ExplainCallout>
        The cost estimate is based on team capacity, sprint length, average labor rate, and
        story-point allocation: hours × rate gives the sprint cost, and dividing by sprint
        capacity gives the cost per story point that every artifact&apos;s estimate rolls up from.
      </ExplainCallout>
    </Card>
  );
}
