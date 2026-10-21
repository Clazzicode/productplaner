import { QUESTIONNAIRE_SECTIONS } from "./SectionProgress";
import { readinessPercent, type RoadmapReadinessGap } from "@/lib/questionnaire/roadmapReadiness";

export default function RoadmapReadinessPanel(props: {
  gaps: RoadmapReadinessGap[];
  onNavigate: (section: number) => void;
  alreadyGenerated?: boolean;
}) {
  const required = props.gaps.filter((gap) => gap.severity === "required");
  const recommended = props.gaps.filter((gap) => gap.severity === "recommended");
  const score = readinessPercent(props.gaps);

  return (
    <aside className="mb-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm md:p-6" aria-labelledby="roadmap-readiness-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Available from the start</p>
          <h2 id="roadmap-readiness-title" className="mt-1 text-xl font-semibold text-text-primary">Your planning readiness</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">
            This view is created from the information you have now. It updates as you answer and shows what to do next. The answers establish candidate backlog work and capacity assumptions; sprint readiness is checked separately for each story or bug.
          </p>
        </div>
        <div className="min-w-32 rounded-2xl bg-neutral-50 px-4 py-3 text-center">
          <p className="text-2xl font-semibold tabular-nums text-text-primary">{score}%</p>
          <p className="text-xs text-text-muted">information coverage</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <ReadinessStage
          number="01"
          title="Establish the foundation"
          summary={required.length === 0 ? "Core information is present." : `${required.length} core answer${required.length === 1 ? "" : "s"} needed for reliable sequencing and capacity.`}
          gaps={required}
          emptyMessage="Core information is in place."
          onNavigate={props.onNavigate}
          tone="required"
        />
        <ReadinessStage
          number="02"
          title="Strengthen the evidence"
          summary={recommended.length === 0 ? "No additional input gaps detected." : `${recommended.length} answer${recommended.length === 1 ? "" : "s"} would improve detail and confidence.`}
          gaps={recommended}
          emptyMessage="No additional input gaps detected."
          onNavigate={props.onNavigate}
          tone="recommended"
        />
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">03 · Backlog foundation</p>
          <h3 className="mt-2 text-sm font-semibold text-text-primary">
            {props.alreadyGenerated ? "Detailed plan already exists" : required.length === 0 ? "Review and build the detailed plan" : "Available after the foundation is complete"}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            {props.alreadyGenerated
              ? "Your backlog foundation is available. Review story readiness and create an editable sprint draft in Sprint Planning."
              : required.length === 0
              ? "Review the remaining assumptions, then prepare prioritized features, stories, and delivery estimates. Sprint commitment stays a separate decision."
              : "Planning readiness is available now. Fill the core gaps before treating scope and delivery estimates as reliable."}
          </p>
          <button type="button" onClick={() => props.onNavigate(5)} className="mt-4 text-xs font-semibold text-accent hover:underline">
            Review the plan inputs →
          </button>
        </div>
      </div>
    </aside>
  );
}

function ReadinessStage(props: {
  number: string;
  title: string;
  summary: string;
  gaps: RoadmapReadinessGap[];
  emptyMessage: string;
  onNavigate: (section: number) => void;
  tone: "required" | "recommended";
}) {
  return (
    <div className={`rounded-2xl border p-4 ${props.tone === "required" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${props.tone === "required" ? "text-red-700" : "text-amber-700"}`}>
        {props.number} · {props.tone === "required" ? "Core inputs" : "Improve confidence"}
      </p>
      <h3 className="mt-2 text-sm font-semibold text-text-primary">{props.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{props.summary}</p>
      {props.gaps.length === 0 ? (
        <p className="mt-4 text-xs font-medium text-emerald-800">✓ {props.emptyMessage}</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {props.gaps.map((gap) => (
            <li key={`${gap.section}-${gap.label}`}>
              <button type="button" onClick={() => props.onNavigate(gap.section)} className="w-full rounded-xl border border-white bg-white/90 p-3 text-left hover:border-accent/30 hover:shadow-sm">
                <span className="block text-xs font-semibold text-text-primary">{gap.label} →</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-text-secondary">{gap.detail}</span>
                <span className="mt-1 block text-[11px] font-medium text-accent">{QUESTIONNAIRE_SECTIONS[gap.section]}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
