import Link from "next/link";
import { PROTOTYPE_DISCLAIMER } from "@/lib/generation/constants";
import type { IntakeFlag } from "@/lib/generation/types";

interface Counts {
  phases: number;
  features: number;
  epics: number;
  stories: number;
  acs: number;
  sprints: number;
  releases: number;
}

interface AssumptionRow {
  label: string;
  value: string;
  isDefault: boolean;
}

export default function GenerationReviewSummary(props: {
  initiativeId: string;
  initiativeName: string;
  counts: Counts;
  capacityPoints: number;
  assumptions: AssumptionRow[];
  warnings: IntakeFlag[];
}) {
  const { initiativeId, counts } = props;
  const chain: [string, number][] = [
    ["Roadmap phases", counts.phases],
    ["Features", counts.features],
    ["Epics", counts.epics],
    ["User stories", counts.stories],
    ["Acceptance criteria", counts.acs],
    ["Sprints", counts.sprints],
    ["Releases", counts.releases],
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
        Generation complete
      </p>
      <h1 className="mt-1 text-2xl font-bold">Your connected product plan has been created</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {props.initiativeName} — every artifact below traces back to an intake answer, and the
        sprint plan was packed against {props.capacityPoints} points of estimated sprint capacity.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {chain.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-neutral-50 px-3 py-3 text-center">
            <p className="text-xl font-bold text-indigo-700">{n}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-neutral-800">Assumptions used</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        Values marked “assumption” are §31 prototype defaults — replace them with your own on the
        Capacity &amp; Cost page at any time.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {props.assumptions.map((a) => (
          <div key={a.label} className="flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-1.5">
            <dt className="text-neutral-500">{a.label}</dt>
            <dd className="text-right font-medium">
              {a.value}
              {a.isDefault && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  assumption
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {props.warnings.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-neutral-800">
            Heads-ups carried into the plan ({props.warnings.length})
          </h2>
          <div className="mt-2 space-y-2">
            {props.warnings.map((w, i) => (
              <p key={i} className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                {w.message}
              </p>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
        {PROTOTYPE_DISCLAIMER}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/initiatives/${initiativeId}/dashboard`}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          View Dashboard
        </Link>
        <Link
          href={`/initiatives/${initiativeId}/workspace/roadmap`}
          className="rounded-lg border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Review Roadmap
        </Link>
        <Link
          href={`/initiatives/${initiativeId}/workspace/capacity`}
          className="rounded-lg border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Review Assumptions
        </Link>
        <Link
          href={`/initiatives/${initiativeId}/intake`}
          className="px-2 py-3 text-sm text-neutral-500 hover:text-neutral-800"
        >
          Return to Intake
        </Link>
      </div>
    </div>
  );
}

export type { AssumptionRow, Counts };
