"use client";
import type { RequestInput } from "@/lib/requests/model";
import { requirementGaps } from "@/lib/requests/model";
import PriorityFields from "./PriorityFields";

export type RequestTab = "intake" | "requirements" | "priority";
export default function RequestEditor({ value, onChange, tab }: {
  value: RequestInput; onChange: (value: RequestInput) => void; tab: RequestTab;
}) {
  const text = (key: "title" | "requestor" | "problem" | "requestedChange" | "outcome" | "businessRules" | "dependencies", label: string, long = false) => <label className="block text-sm font-medium" key={key}>
    {label}{long ? <textarea className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" rows={3} maxLength={8000} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} />
      : <input className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" maxLength={160} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} />}
  </label>;
  if (tab === "priority") return <PriorityFields value={value.priority} onChange={priority => onChange({ ...value, priority })} />;
  if (tab === "intake") return <div className="space-y-4">
    {text("title", "Request title")}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">Request type<select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5" value={value.kind} onChange={e => onChange({ ...value, kind: e.target.value as RequestInput["kind"] })}>
        <option value="new_feature">New feature</option><option value="enhancement">Enhancement</option><option value="defect">Defect</option>
      </select></label>{text("requestor", "Requestor / business owner")}
    </div>
    {text("problem", "What problem needs solving?", true)}
    {text("requestedChange", "What change is requested?", true)}
    {text("outcome", "Expected outcome / success measure", true)}
  </div>;
  const gaps = requirementGaps(value);
  return <div className="space-y-5">
    <div className={`rounded-lg p-4 text-sm ${gaps.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
      <p className="font-semibold">{gaps.length ? "Needs clarification" : "Requirements checklist complete"}</p>
      {gaps.length ? <ul className="mt-2 list-disc pl-5">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : <p className="mt-1">Core requirements are present and open questions have answers. The PO still needs to review and approve.</p>}
    </div>
    {text("businessRules", "Business rules and constraints", true)}
    {text("dependencies", "Dependencies and follow-up needed", true)}
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Questions & clarification</h3>
      <button type="button" className="rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700" disabled={value.questions.length >= 30} onClick={() => onChange({ ...value, questions: [...value.questions, { id: crypto.randomUUID(), question: "", owner: "", answer: "" }] })}>Add question</button>
    </div>
    {value.questions.length === 0 ? <p className="text-sm text-slate-500">No questions recorded. Add any uncertainty before marking requirements ready.</p> : value.questions.map((q, index) => {
      const update = (field: "question" | "owner" | "answer", next: string) => onChange({ ...value, questions: value.questions.map(item => item.id === q.id ? { ...item, [field]: next } : item) });
      return <div key={q.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between"><span className="text-sm font-semibold">Question {index + 1} · {q.answer.trim() ? "Answered" : "Open"}</span><button type="button" className="text-sm text-red-700" onClick={() => onChange({ ...value, questions: value.questions.filter(item => item.id !== q.id) })}>Remove question {index + 1}</button></div>
        <label className="block text-sm">Question<input maxLength={1000} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={q.question} onChange={e => update("question", e.target.value)} /></label>
        <label className="block text-sm">Question owner<input maxLength={160} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={q.owner} onChange={e => update("owner", e.target.value)} /></label>
        <label className="block text-sm">Answer / decision<textarea maxLength={2000} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={q.answer} onChange={e => update("answer", e.target.value)} /></label>
      </div>;
    })}
  </div>;
}
