import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import PendingBusinessRule from "@/components/ui/PendingBusinessRule";
import { HEALTH_LABELS } from "@/lib/generation/health";
import { ROLE_ROADMAP_COPY } from "@/lib/roadmap/roleRoadmapCopy";
import type { ProjectRoadmapView } from "@/lib/roadmap/roleRoadmapView";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function SwotColumn(props: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{props.label}</p>
      {props.items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {props.items.map((item, i) => (
            <li key={i} className="text-xs text-neutral-600">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">Nothing flagged.</p>
      )}
    </div>
  );
}

/** Project Manager lens: Product Outcome -> WBS -> Cost -> Risk -> Dependencies
 * -> Milestones -> Schedule -> Project Roadmap. Risk is expressed via SWOT here
 * instead of the Low/Medium/High badge; dependencies are turned into sentence-
 * form sequencing notes rather than the protected name-list/badge presentation
 * used elsewhere in the app. */
export default function ProjectRoadmapPanel(props: { view: ProjectRoadmapView }) {
  const { view } = props;
  const copy = ROLE_ROADMAP_COPY.project_manager;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{copy.pageTitle}</CardTitle>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-600">{copy.businessValueFraming.label}:</span>{" "}
        {copy.businessValueFraming.factors.join(" · ")} — {copy.businessValueFraming.note}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-800">{money(view.cost.estimatedInitiativeCost)}</span>
        <span className="text-xs text-neutral-500">estimated cost</span>
        {view.cost.budgetVariance && (
          <span className="text-xs text-neutral-500">
            {view.cost.budgetVariance.percent >= 0 ? "+" : ""}
            {view.cost.budgetVariance.percent}% vs. budget
          </span>
        )}
        {view.cost.costHealth && (
          <Badge variant={healthBadgeVariant(view.cost.costHealth)}>{HEALTH_LABELS[view.cost.costHealth]}</Badge>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {view.phases.map((phase) => (
          <div key={phase.phaseNumber} className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {phase.themes.join(" · ")}
            </p>
            <p className="text-[11px] text-neutral-400">
              {phase.quarterLabel ? `${phase.quarterLabel} · ${phase.name}` : phase.name}
            </p>
            <ul className="mt-2 space-y-2">
              {phase.items.map((item) => (
                <li key={item.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <p className="flex items-center justify-between gap-2 text-sm font-medium">
                    <span>{item.name}</span>
                    <span className="text-xs font-normal text-neutral-500">{money(item.estimatedCost)}</span>
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

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">SWOT</p>
        <div className="mt-2">
          <PendingBusinessRule conceptId="risk_project_manager" part="output" label="Overall risk level" mode="block" />
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <SwotColumn label="Strengths" items={view.swot.strengths} />
          <SwotColumn label="Weaknesses" items={view.swot.weaknesses} />
          <SwotColumn label="Opportunities" items={view.swot.opportunities} />
          <SwotColumn label="Threats" items={view.swot.threats} />
        </div>
      </div>

      {view.sequencingNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sequencing</p>
          <ul className="mt-2 space-y-1">
            {view.sequencingNotes.map((note, i) => (
              <li key={i} className="text-xs text-neutral-600">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.milestones.length > 0 && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Milestones</p>
          <ul className="mt-2 space-y-1">
            {view.milestones.map((m, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-neutral-600">
                <span>{m.name}</span>
                <span>{m.targetDate.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
