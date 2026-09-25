import { Badge, riskBadgeVariant, valueBadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { VALUE_LABELS } from "@/lib/generation/constants";
import { businessValueGuidance, riskLevelGuidance } from "@/lib/questionnaire/valueRiskGuidance";
import { ROLE_ROADMAP_COPY } from "@/lib/roadmap/roleRoadmapCopy";
import type { ProductRoadmapView } from "@/lib/roadmap/roleRoadmapView";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Product Manager / Product Owner lens: Product -> Features -> Revenue ->
 * Time to Market -> Priority -> Dependencies -> Roadmap. Product Owner gets
 * the identical panel plus an appended backlog-readiness strip — "closely
 * connected" experiences, not a separate view. */
export default function ProductRoadmapPanel(props: { view: ProductRoadmapView }) {
  const { view } = props;
  const copy = ROLE_ROADMAP_COPY[view.role];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{copy.pageTitle}</CardTitle>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-600">{view.businessValueFraming.label}:</span>{" "}
        {view.businessValueFraming.factors.join(" · ")} — {view.businessValueFraming.note}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {view.phases.map((phase) => (
          <div key={phase.phaseNumber} className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {phase.quarterLabel ? `${phase.quarterLabel} · ${phase.name}` : phase.name}
            </p>
            <ul className="mt-2 space-y-2">
              {phase.items.map((item) => (
                <li key={item.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium">
                    {item.name}
                    {item.isMvp && (
                      <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        MVP
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge
                      variant={valueBadgeVariant(item.businessValue)}
                      title={businessValueGuidance(item.businessValue, false)}
                    >
                      {VALUE_LABELS[item.businessValue]}
                    </Badge>
                    <Badge variant={riskBadgeVariant(item.riskLevel)} title={riskLevelGuidance(item.riskLevel, false)}>
                      risk {item.riskLevel}
                    </Badge>
                    {item.revenueImpactScore != null && (
                      <Badge variant="indigo">revenue {item.revenueImpactScore}/5</Badge>
                    )}
                    <span className="text-xs text-neutral-500">{money(item.estimatedCost)}</span>
                  </p>
                </li>
              ))}
              {phase.items.length === 0 && (
                <li className="px-1 text-xs text-neutral-400">Nothing planned in this phase.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Backlog readiness</p>
        <p className="mt-1 text-sm text-neutral-700">
          {view.backlogReadiness.label === "ready"
            ? "The backlog looks ready — no oversized stories or overly broad features flagged."
            : `Needs refinement — ${view.backlogReadiness.oversizedStoryCount} oversized ${
                view.backlogReadiness.oversizedStoryCount === 1 ? "story" : "stories"
              } and ${view.backlogReadiness.tooBroadCapabilityCount} overly broad ${
                view.backlogReadiness.tooBroadCapabilityCount === 1 ? "feature" : "features"
              } flagged.`}
        </p>
      </div>
    </Card>
  );
}
