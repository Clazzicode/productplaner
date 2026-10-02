"use client";
import { priorityFactors, priorityScore, type RequestInput } from "@/lib/requests/model";

export default function PriorityFields({ value, onChange }: {
  value: RequestInput["priority"]; onChange: (value: RequestInput["priority"]) => void;
}) {
  return <section className="space-y-5">
    <div className="rounded-xl bg-indigo-50 p-5 text-indigo-950">
      <p className="text-sm font-semibold">Explainable request score</p>
      <p className="mt-1 text-3xl font-bold">{priorityScore(value)}<span className="text-base font-normal"> / 100</span></p>
      <p className="mt-2 text-sm">A comparison aid, not an automatic decision. Higher delivery risk and effort reduce the score. The PO chooses what happens next.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {priorityFactors.map(f => <label key={f.key} className="block text-sm font-medium">
        {f.label} <span className="font-normal text-slate-500">({f.weight}%)</span>
        <select value={value[f.key]} onChange={e => onChange({ ...value, [f.key]: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select><span className="mt-1 block text-xs font-normal text-slate-500">{f.help}</span>
      </label>)}
    </div>
    <label className="block text-sm font-medium">PO priority decision
      <select value={value.decision} onChange={e => onChange({ ...value, decision: e.target.value as RequestInput["priority"]["decision"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5">
        <option value="untriaged">Not decided</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option>
      </select>
    </label>
    <label className="block text-sm font-medium">Decision rationale
      <textarea value={value.reason} onChange={e => onChange({ ...value, reason: e.target.value })} maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" placeholder="Why does this belong here? Record tradeoffs or explain an override of the score." />
    </label>
    <p className="text-xs text-slate-500">This score supports request triage. Existing roadmap scores remain unchanged. Creating a feature copies its value, effort and risk; dependencies and MVP scope are reviewed in guided intake.</p>
  </section>;
}
