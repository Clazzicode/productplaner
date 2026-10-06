import Link from "next/link";

export interface PlanningFeature {
  id: string;
  name: string;
  description: string;
  backlogLane: string;
  businessValue: string;
  riskLevel: string;
  dependencyCount: number;
}

const lanes = [
  { id: "now", label: "Now", detail: "Highest-priority work being addressed first" },
  { id: "next", label: "Next", detail: "Work expected after the current focus" },
  { id: "later", label: "Later", detail: "Valuable work intentionally deferred" },
  { id: "unscheduled", label: "Unscheduled", detail: "Prioritized work still awaiting placement" },
] as const;

export default function RoadmapPlanningView({ initiativeId, features }: { initiativeId: string; features: PlanningFeature[] }) {
  if (features.length === 0) return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
    <h3 className="font-semibold text-slate-900">No roadmap features are available yet</h3>
    <p className="mt-1 text-sm text-slate-600">Approve an intake request and create its planning feature before generating the roadmap.</p>
    <Link href={`/initiatives/${initiativeId}/requests`} className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Review requests</Link>
  </div>;

  const placedCount = features.filter((feature) => feature.backlogLane !== "unscheduled").length;
  return <div>
    {placedCount === 0 && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      {features.length} prioritized feature{features.length === 1 ? " is" : "s are"} available, but none have a roadmap placement. Assign them to Now, Next, or Later in the feature backlog.
    </div>}
    <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
      This planning view works without dates or sprint assignments. Move features in the feature backlog to decide what belongs in Now, Next, Later, or Unscheduled.
    </div>
    <div className="grid gap-4 xl:grid-cols-4">{lanes.map((lane) => {
      const items = features.filter((feature) => feature.backlogLane === lane.id);
      return <section key={lane.id} className="rounded-xl bg-slate-100 p-4">
        <div className="mb-4"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-950">{lane.label}</h3><span className="text-sm text-slate-500">{items.length}</span></div><p className="mt-1 text-xs text-slate-500">{lane.detail}</p></div>
        <div className="space-y-3">{items.map((feature) => <article key={feature.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h4 className="font-semibold text-slate-950">{feature.name}</h4>
          <p className="mt-1 line-clamp-3 text-xs text-slate-600">{feature.description || "No description yet."}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className="rounded-full bg-indigo-50 px-2 py-1 capitalize text-indigo-700">{feature.businessValue.replaceAll("_", " ")} value</span><span className="rounded-full bg-amber-50 px-2 py-1 capitalize text-amber-800">{feature.riskLevel} risk</span>{feature.dependencyCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{feature.dependencyCount} dependencies</span>}</div>
        </article>)}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">No features placed here.</p>}
        </div>
      </section>;
    })}</div>
    <Link href={`/initiatives/${initiativeId}/backlog`} className="mt-4 inline-block text-sm font-semibold text-indigo-700">Edit roadmap placement in the feature backlog →</Link>
  </div>;
}
