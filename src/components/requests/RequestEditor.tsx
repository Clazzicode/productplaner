"use client";

import type { RequestInput } from "@/lib/requests/model";
import { requirementGaps } from "@/lib/requests/model";
import PriorityFields from "./PriorityFields";

export type RequestTab = "intake" | "requirements" | "priority";

const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5";

export default function RequestEditor({ value, onChange, tab }: {
  value: RequestInput; onChange: (value: RequestInput) => void; tab: RequestTab;
}) {
  const field = (key: keyof Pick<RequestInput,
    "title" | "requestor" | "problem" | "requestedChange" | "outcome" | "userAffected" |
    "businessValueNarrative" | "businessRules" | "inScope" | "outOfScope" | "assumptions" |
    "dependencies" | "risks" | "stakeholders" | "supportingMaterials" | "definitionOfSuccess"
  >, label: string, long = false, placeholder?: string) => (
    <label className="block text-sm font-medium" key={key}>
      {label}
      {long ? (
        <textarea className={inputClass} rows={3} maxLength={8000} value={value[key]}
          placeholder={placeholder} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
      ) : (
        <input className={inputClass} maxLength={160} value={value[key]}
          placeholder={placeholder} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
      )}
    </label>
  );

  if (tab === "priority") {
    return <PriorityFields requestKind={value.kind} value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />;
  }

  if (tab === "intake") {
    const isBug = value.kind === "bug" || value.kind === "defect";
    return <div className="space-y-4">
      {field("title", "Request title")}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Work type
          <select className={inputClass} value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as RequestInput["kind"],
            priority: { ...value.priority, bugSeverity: ["bug", "defect"].includes(e.target.value) ? value.priority.bugSeverity === "not_applicable" ? "medium" : value.priority.bugSeverity : "not_applicable" } })}>
            <option value="new_feature">Feature request</option><option value="enhancement">Enhancement</option>
            <option value="bug">Bug</option><option value="defect">Defect</option><option value="research">Research item</option><option value="other">Other</option>
          </select>
        </label>
        {field("requestor", "Requestor / business owner")}
        <label className="block text-sm font-medium">Source
          <select className={inputClass} value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value as RequestInput["source"] })}>
            <option value="manual">Manual entry</option><option value="jira">Jira</option><option value="spreadsheet">Spreadsheet</option>
            <option value="document">Document</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Source reference
          <input className={inputClass} maxLength={500} value={value.sourceReference}
            placeholder="Jira key, file name, meeting, email, or external reference"
            onChange={(e) => onChange({ ...value, sourceReference: e.target.value })} />
        </label>
      </div>
      {value.source === "document" && <label className="block text-sm font-medium">How should this document be used?
        <select className={inputClass} value={value.documentUse} onChange={(e) => onChange({ ...value, documentUse: e.target.value as RequestInput["documentUse"] })}>
          <option value="">Choose an outcome</option><option value="extract_requirements">Extract requirements</option>
          <option value="identify_bugs">Identify bugs</option><option value="summarize">Summarize the document</option>
          <option value="create_backlog_items">Propose backlog items</option><option value="other">Other</option>
        </select>
      </label>}
      {value.source === "meeting" && <label className="block text-sm font-medium">Meeting notes used for this request
        <textarea className={inputClass} rows={6} maxLength={20000} value={value.meetingNotes}
          placeholder="Paste the original meeting notes. They are preserved as immutable source evidence when the request is saved."
          onChange={(e) => onChange({ ...value, meetingNotes: e.target.value })} />
      </label>}
      {field("problem", "What problem needs solving?", true)}
      {field("requestedChange", "What change is requested?", true)}
      {field("outcome", "Requested outcome", true)}
      {isBug && <section className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
        <div><h3 className="font-semibold text-rose-950">Bug details</h3><p className="text-xs text-rose-800">Keep the original source so this planning record remains traceable to Jira, a spreadsheet, or a manual report.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">Severity<select className={inputClass} value={value.bug.severity} onChange={(e) => onChange({ ...value, bug: { ...value.bug, severity: e.target.value as RequestInput["bug"]["severity"] }, priority: { ...value.priority, bugSeverity: e.target.value as RequestInput["priority"]["bugSeverity"] } })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select></label>
          <label className="text-sm font-medium">Current status<select className={inputClass} value={value.bug.status} onChange={(e) => onChange({ ...value, bug: { ...value.bug, status: e.target.value as RequestInput["bug"]["status"] } })}>
            <option value="reported">Reported</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select></label>
          <label className="text-sm font-medium">Affected area<input className={inputClass} value={value.bug.affectedArea} maxLength={160} onChange={(e) => onChange({ ...value, bug: { ...value.bug, affectedArea: e.target.value } })} /></label>
        </div>
        {[{ key: "observedBehavior", label: "Observed behavior" }, { key: "expectedBehavior", label: "Expected behavior" }, { key: "reproductionDetails", label: "Reproduction details" }] .map(({ key, label }) => <label key={key} className="block text-sm font-medium">{label}<textarea className={inputClass} rows={3} value={value.bug[key as keyof Pick<RequestInput["bug"], "observedBehavior" | "expectedBehavior" | "reproductionDetails">]} onChange={(e) => onChange({ ...value, bug: { ...value.bug, [key]: e.target.value } })} /></label>)}
        <label className="block text-sm font-medium">Environment<input className={inputClass} value={value.bug.environment} maxLength={160} placeholder="Browser, app version, device, or environment" onChange={(e) => onChange({ ...value, bug: { ...value.bug, environment: e.target.value } })} /></label>
      </section>}
    </div>;
  }

  const gaps = requirementGaps(value);
  return <div className="space-y-5">
    <div className={`rounded-lg p-4 text-sm ${gaps.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
      <p className="font-semibold">{gaps.length ? `${gaps.length} requirements need attention` : "Requirements checklist complete"}</p>
      {gaps.length ? <ul className="mt-2 list-disc pl-5">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p className="mt-1">Core requirements and open questions are complete. The Product Owner still controls the readiness decision.</p>}
    </div>
    <label className="block text-sm font-medium">Requirements readiness
      <select className={inputClass} value={value.readiness} onChange={(e) => onChange({ ...value, readiness: e.target.value as RequestInput["readiness"] })}>
        <option value="needs_clarification">Needs clarification</option><option value="ready_for_feature">Ready for feature creation</option>
        <option value="ready_for_story">Ready for story breakdown</option><option value="blocked_by_decision">Blocked by decision</option>
      </select>
    </label>
    <div className="grid gap-4 lg:grid-cols-2">
      {field("userAffected", "User or customer affected", true)}
      {field("businessValueNarrative", "Business value", true)}
      {field("businessRules", "Business rules", true, "Enter the rules or state that none are known.")}
      {field("definitionOfSuccess", "Definition of success", true)}
      {field("inScope", "In scope", true)}
      {field("outOfScope", "Out of scope", true)}
      {field("assumptions", "Assumptions", true, "Enter assumptions or state that none are known.")}
      {field("dependencies", "Dependencies and follow-up needed", true, "Enter dependencies or state that none are known.")}
      {field("risks", "Risks", true, "Enter risks or state that none are known.")}
      {field("stakeholders", "Stakeholders and decision makers", true)}
      {field("supportingMaterials", "Supporting documents and source material", true, "Add document names or links, or state that none exists.")}
    </div>
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Questions & clarification</h3>
      <button type="button" className="rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700" disabled={value.questions.length >= 30} onClick={() => onChange({ ...value, questions: [...value.questions, { id: crypto.randomUUID(), question: "", owner: "", answer: "" }] })}>Add question</button>
    </div>
    {value.questions.length === 0 ? <p className="text-sm text-slate-500">No open questions recorded. Add unresolved decisions before declaring this work ready.</p> : value.questions.map((q, index) => {
      const update = (key: "question" | "owner" | "answer", next: string) => onChange({ ...value, questions: value.questions.map((item) => item.id === q.id ? { ...item, [key]: next } : item) });
      return <div key={q.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between"><span className="text-sm font-semibold">Question {index + 1} · {q.answer.trim() ? "Answered" : "Open"}</span><button type="button" className="text-sm text-red-700" onClick={() => onChange({ ...value, questions: value.questions.filter((item) => item.id !== q.id) })}>Remove question {index + 1}</button></div>
        <label className="block text-sm">Question<input maxLength={1000} className={inputClass} value={q.question} onChange={(e) => update("question", e.target.value)} /></label>
        <label className="block text-sm">Question owner<input maxLength={160} className={inputClass} value={q.owner} onChange={(e) => update("owner", e.target.value)} /></label>
        <label className="block text-sm">Answer / decision<textarea maxLength={2000} className={inputClass} value={q.answer} onChange={(e) => update("answer", e.target.value)} /></label>
      </div>;
    })}
  </div>;
}
