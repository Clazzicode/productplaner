"use client";

import { effortRating, fibonacciEffort, priorityExplanation, priorityFactors, priorityScore, type RequestInput } from "@/lib/requests/model";

export default function PriorityFields({ value, onChange, requestKind }: {
  value: RequestInput["priority"];
  onChange: (value: RequestInput["priority"]) => void;
  requestKind: RequestInput["kind"];
}) {
  const isBug = requestKind === "bug" || requestKind === "defect";
  return <section className="space-y-5">
    <div className="rounded-xl bg-indigo-50 p-5 text-indigo-950">
      <p className="text-sm font-semibold">Explainable request score</p>
      <p className="mt-1 text-3xl font-bold">{priorityScore(value)}<span className="text-base font-normal"> / 100</span></p>
      <p className="mt-2 text-sm">{priorityExplanation(value)}</p>
      <p className="mt-1 text-xs">This is a comparison aid. The Product Owner makes the final decision and records why.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">MoSCoW classification
        <select value={value.moscow} onChange={(e) => onChange({ ...value, moscow: e.target.value as RequestInput["priority"]["moscow"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
          <option value="must">Must have</option><option value="should">Should have</option><option value="could">Could have</option><option value="wont_now">Won&apos;t have for now</option>
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500">Explains necessity; it does not assign a roadmap date.</span>
      </label>
      <label className="block text-sm font-medium">Effort estimate
        <select value={value.effortPoints} onChange={(e) => { const points = Number(e.target.value); onChange({ ...value, effortPoints: points as RequestInput["priority"]["effortPoints"], effort: effortRating(points) }); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
          {fibonacciEffort.map((points) => <option key={points} value={points}>{points} point{points === 1 ? "" : "s"}</option>)}
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500">Fibonacci sizing: 1, 2, 3, 5, 8, or 13.</span>
      </label>
      {priorityFactors.filter((factor) => factor.key !== "effort").map((factor) => <label key={factor.key} className="block text-sm font-medium">
        {factor.label} <span className="font-normal text-slate-500">({factor.weight}%)</span>
        <select value={value[factor.key]} onChange={(e) => onChange({ ...value, [factor.key]: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select><span className="mt-1 block text-xs font-normal text-slate-500">{factor.help}</span>
      </label>)}
      {isBug && <label className="block text-sm font-medium">Bug severity
        <select value={value.bugSeverity} onChange={(e) => onChange({ ...value, bugSeverity: e.target.value as RequestInput["priority"]["bugSeverity"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
      </label>}
    </div>
    <label className="block text-sm font-medium">Roadmap placement decision
      <select value={value.decision} onChange={(e) => onChange({ ...value, decision: e.target.value as RequestInput["priority"]["decision"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
        <option value="untriaged">Not decided</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option>
      </select>
      <span className="mt-1 block text-xs font-normal text-slate-500">Priority order and release assignment remain separate decisions.</span>
    </label>
    <label className="block text-sm font-medium">Decision rationale
      <textarea value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" placeholder="Explain the decision, tradeoffs, or why the PO overrode the calculated ranking." />
    </label>
    <p className="text-xs text-slate-500">Each saved change is written to the audit trail with the previous and new priority values.</p>
  </section>;
}
