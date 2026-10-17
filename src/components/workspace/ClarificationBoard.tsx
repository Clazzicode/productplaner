"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/clientApi";

type WorkItem = { key: string; type: "story" | "bug"; id: string; title: string; sprintId: string; sprintNumber: number };
type Owner = { id: string; name: string; email: string };
type Suggestion = { id: string; draftAnswer: string; informationUsed: string; status: string };
type Clarification = {
  id: string; sprintId: string; storyId: string | null; bugId: string | null; question: string; context: string;
  status: string; urgency: string; answer: string; rationale: string; impact: string; revision: number;
  dueAt: string | null; externalReference: string | null;
  followUpRequestId: string | null;
  requester: { id: string; name: string }; owner: { id: string; name: string } | null;
  answeredBy: { name: string } | null; acknowledgedBy: { name: string } | null; resolvedBy: { name: string } | null;
  createdAt: string; answeredAt: string | null; acknowledgedAt: string | null; resolvedAt: string | null;
  aiSuggestions: Suggestion[];
  revisions: { id: string; reason: string; createdAt: string; actor: { name: string } | null }[];
};

const IMPACT_OPTIONS = [
  ["none", "No work change"], ["clarification_only", "Clarification only"],
  ["acceptance_criteria_change", "Acceptance criteria change"], ["scope_change", "Scope change"],
  ["estimate_impact", "Estimate impact"], ["schedule_impact", "Schedule impact"], ["follow_up_work", "Follow-up work"],
] as const;

export default function ClarificationBoard(props: { initiativeId: string; currentUserId: string; canDecide: boolean; workItems: WorkItem[]; owners: Owner[]; clarifications: Clarification[] }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(props.workItems[0]?.key ?? "");
  const [question, setQuestion] = useState(""); const [context, setContext] = useState(""); const [urgency, setUrgency] = useState("normal");
  const [ownerUserId, setOwnerUserId] = useState(""); const [dueAt, setDueAt] = useState(""); const [externalReference, setExternalReference] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { answer: string; rationale: string; impact: string; suggestionId: string | null; followUpTitle: string }>>({});
  const [pending, setPending] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const itemsByKey = useMemo(() => new Map(props.workItems.map((item) => [item.key, item])), [props.workItems]);
  const workTitle = (row: Clarification) => props.workItems.find((item) => item.id === (row.storyId ?? row.bugId) && item.sprintId === row.sprintId)?.title ?? "Sprint item";
  const draft = (row: Clarification) => drafts[row.id] ?? { answer: row.answer, rationale: row.rationale, impact: row.impact, suggestionId: null, followUpTitle: `Follow up: ${row.question}`.slice(0, 160) };
  const setDraft = (row: Clarification, value: Partial<ReturnType<typeof draft>>) => setDrafts((all) => ({ ...all, [row.id]: { ...draft(row), ...value } }));

  async function create() {
    const item = itemsByKey.get(selectedKey); if (!item) return;
    setPending("create"); setError(null);
    const result = await apiFetch(`/api/initiatives/${props.initiativeId}/clarifications`, { method: "POST", body: {
      sprintId: item.sprintId, storyId: item.type === "story" ? item.id : null, bugId: item.type === "bug" ? item.id : null,
      question, context, urgency, ownerUserId: ownerUserId || null,
      dueAt: dueAt ? `${dueAt}T23:59:59` : null, externalReference: externalReference.trim() || null,
    } });
    setPending(null); if (!result.ok) return setError(result.error ?? "Couldn't create clarification.");
    setQuestion(""); setContext(""); setUrgency("normal"); setOwnerUserId(""); setDueAt(""); setExternalReference(""); router.refresh();
  }

  async function command(row: Clarification, action: "answer" | "acknowledge" | "resolve" | "reopen" | "withdraw" | "create_follow_up") {
    const current = draft(row); setPending(`${row.id}:${action}`); setError(null);
    const result = await apiFetch(`/api/clarifications/${row.id}`, { method: "PATCH", body: {
      action, expectedRevision: row.revision,
      reason: action === "answer" ? (current.rationale.trim() || "Product Owner clarification provided") : ({
        acknowledge: "Clarification acknowledged", resolve: "Clarification resolved",
        reopen: "Clarification reopened", withdraw: "Clarification withdrawn", create_follow_up: "Follow-up request created from clarification",
      } as const)[action],
      ...(action === "answer" ? { answer: current.answer, rationale: current.rationale, impact: current.impact, suggestionId: current.suggestionId } : {}),
      ...(action === "create_follow_up" ? { title: current.followUpTitle } : {}),
    } });
    setPending(null); if (!result.ok) return setError(result.error ?? `Couldn't ${action} clarification.`); router.refresh();
  }

  async function generateDraft(row: Clarification) {
    setPending(`${row.id}:ai`); setError(null);
    const result = await apiFetch<{ suggestion: Suggestion }>(`/api/clarifications/${row.id}/draft-answer`, { method: "POST" });
    setPending(null); if (!result.ok || !result.data?.suggestion) return setError(result.error ?? "Couldn't draft an answer.");
    const suggestion = result.data.suggestion; setDraft(row, { answer: suggestion.draftAnswer, suggestionId: suggestion.id });
  }

  async function dismissSuggestion(row: Clarification, suggestion: Suggestion) {
    setPending(`${row.id}:dismiss`); setError(null);
    const result = await apiFetch(`/api/clarification-suggestions/${suggestion.id}`, { method: "PATCH", body: { action: "dismiss" } });
    setPending(null); if (!result.ok) return setError(result.error ?? "Couldn't dismiss the draft."); router.refresh();
  }

  return <section className="mt-10 space-y-5" aria-labelledby="clarification-heading">
    <div><h3 id="clarification-heading" className="text-lg font-semibold">In-sprint clarifications</h3><p className="text-sm text-neutral-500">Ask a focused question about committed sprint work, record the Product Owner answer, and preserve every decision and impact.</p></div>
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {props.workItems.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-neutral-500">Commit a sprint plan before opening a clarification.</p> : <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold">Ask about committed work</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Sprint item<select className="mt-1 block w-full rounded-lg border px-3 py-2" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>{props.workItems.map((item) => <option key={item.key} value={item.key}>Sprint {item.sprintNumber} · {item.title}</option>)}</select></label>
        <label className="text-sm font-medium">Urgency<select className="mt-1 block w-full rounded-lg border px-3 py-2" value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="text-sm font-medium">Owner<select className="mt-1 block w-full rounded-lg border px-3 py-2" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}><option value="">Unassigned</option>{props.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} ({owner.email})</option>)}</select></label>
        <label className="text-sm font-medium">Due date<Input className="mt-1" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
        <label className="text-sm font-medium md:col-span-2">External reference<Input className="mt-1" value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Optional Jira key, incident, or support reference" /></label>
        <label className="text-sm font-medium md:col-span-2">Question<Input className="mt-1" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What does engineering need the Product Owner to clarify?" /></label>
        <label className="text-sm font-medium md:col-span-2">Context<Textarea className="mt-1" value={context} onChange={(event) => setContext(event.target.value)} placeholder="Add the implementation context, decision needed, or observed conflict." /></label>
      </div><Button className="mt-3" disabled={pending !== null || question.trim().length < 5} onClick={create}>Open clarification</Button>
    </div>}
    <div className="space-y-4">{props.clarifications.map((row) => { const current = draft(row); const proposed = row.aiSuggestions.find((item) => item.status === "proposed"); return <article key={row.id} className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{workTitle(row)}</p><h4 className="mt-1 font-semibold">{row.question}</h4><p className="mt-1 text-sm text-neutral-600">{row.context || "No additional context."}</p></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize">{row.status}</span><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${row.urgency === "urgent" || row.urgency === "high" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{row.urgency}</span></div></div>
      <p className="mt-3 text-xs text-neutral-500">Asked by {row.requester.name} · opened <time dateTime={row.createdAt}>{row.createdAt.slice(0, 10)}</time>{row.owner ? ` · owned by ${row.owner.name}` : " · unassigned"}{row.dueAt ? ` · due ${new Date(row.dueAt).toLocaleDateString()}` : ""}{row.externalReference ? ` · ${row.externalReference}` : ""} · revision {row.revision}</p>
      {row.answer ? <div className="mt-4 rounded-lg bg-indigo-50 p-3"><p className="text-xs font-semibold uppercase text-indigo-700">Product Owner answer</p><p className="mt-1 whitespace-pre-wrap text-sm">{row.answer}</p><p className="mt-2 text-xs text-indigo-700">Impact: {row.impact.replaceAll("_", " ")}{row.answeredBy ? ` · answered by ${row.answeredBy.name}` : ""}</p></div> : null}
      {row.followUpRequestId ? <p className="mt-3 text-sm"><Link className="font-medium text-indigo-700 hover:underline" href={`/initiatives/${props.initiativeId}/requests`}>View linked follow-up request</Link></p> : null}
      {props.canDecide && !["resolved", "withdrawn"].includes(row.status) ? <div className="mt-4 border-t pt-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium md:col-span-2">Answer<Textarea className="mt-1" value={current.answer} onChange={(event) => setDraft(row, { answer: event.target.value })} /></label><label className="text-sm font-medium">Impact<select className="mt-1 block w-full rounded-lg border px-3 py-2" value={current.impact} onChange={(event) => setDraft(row, { impact: event.target.value })}>{IMPACT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium">Rationale<Input className="mt-1" value={current.rationale} onChange={(event) => setDraft(row, { rationale: event.target.value })} placeholder="Required for work-impacting answers" /></label></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button disabled={pending !== null || current.answer.trim().length < 3} onClick={() => command(row, "answer")}>{row.answer ? "Update answer" : "Submit answer"}</Button><Button variant="secondary" disabled={pending !== null} onClick={() => generateDraft(row)}>Draft with AI</Button>{["answered", "acknowledged"].includes(row.status) ? <Button variant="secondary" disabled={pending !== null} onClick={() => command(row, "resolve")}>Resolve</Button> : null}</div>
        {proposed ? <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-semibold uppercase text-violet-700">AI draft — review before using</p><p className="mt-1 whitespace-pre-wrap text-sm">{proposed.draftAnswer}</p><p className="mt-2 text-xs text-violet-700">Information used: {proposed.informationUsed}</p><div className="mt-2 flex gap-2"><Button variant="secondary" onClick={() => setDraft(row, { answer: proposed.draftAnswer, suggestionId: proposed.id })}>Use as editable draft</Button><Button variant="secondary" onClick={() => dismissSuggestion(row, proposed)}>Dismiss</Button></div></div> : null}
      </div> : null}
      <div className="mt-4 flex flex-wrap gap-2">{row.status === "answered" && row.requester.id === props.currentUserId ? <Button variant="secondary" disabled={pending !== null} onClick={() => command(row, "acknowledge")}>Acknowledge answer</Button> : null}{["resolved", "withdrawn"].includes(row.status) && props.canDecide ? <Button variant="secondary" disabled={pending !== null} onClick={() => command(row, "reopen")}>Reopen</Button> : null}{!row.answer && row.requester.id === props.currentUserId && row.status !== "withdrawn" ? <Button variant="secondary" disabled={pending !== null} onClick={() => command(row, "withdraw")}>Withdraw question</Button> : null}{row.answer && props.canDecide && !["resolved", "withdrawn"].includes(row.status) ? <Button variant="secondary" disabled={pending !== null} onClick={() => command(row, "withdraw")}>Withdraw answer</Button> : null}</div>
      {props.canDecide && row.answer && ["answered", "acknowledged"].includes(row.status) && !row.followUpRequestId ? <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-medium">Follow-up work title<Input className="mt-1 bg-white" value={current.followUpTitle} onChange={(event) => setDraft(row, { followUpTitle: event.target.value })} /></label><Button variant="secondary" disabled={pending !== null || current.followUpTitle.trim().length < 3} onClick={() => command(row, "create_follow_up")}>Create follow-up work</Button></div> : null}
      {row.revisions.length > 0 ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">History ({row.revisions.length})</summary><ul className="mt-2 space-y-1 text-xs text-neutral-600">{row.revisions.map((revision) => <li key={revision.id}>{new Date(revision.createdAt).toLocaleString()} · {revision.reason} · {revision.actor?.name ?? "System"}</li>)}</ul></details> : null}
    </article>; })}{props.clarifications.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-neutral-500">No in-sprint clarification questions yet.</p> : null}</div>
  </section>;
}

