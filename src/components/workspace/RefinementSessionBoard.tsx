"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/clientApi";

type WorkOption = { id: string; title: string };
type Session = {
  id: string; title: string; status: string; purpose: string; agenda: string; notes: string; summary: string; revision: number;
  facilitator: { name: string } | null;
  items: { id: string; story: { title: string } | null; bug: { severity: string; request: { data: unknown } } | null }[];
  questions: { id: string; question: string; status: string }[];
  decisions: { id: string; title: string }[];
  actions: { id: string; title: string; status: string }[];
};

const requestTitle = (value: unknown) => typeof value === "object" && value && !Array.isArray(value) && "title" in value ? String(value.title) : "Bug";

export default function RefinementSessionBoard(props: { initiativeId: string; stories: WorkOption[]; bugs: WorkOption[]; members: { id: string; name: string }[]; sessions: Session[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(""); const [purpose, setPurpose] = useState(""); const [agenda, setAgenda] = useState("");
  const [storyIds, setStoryIds] = useState<string[]>([]); const [bugIds, setBugIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { notes: string; summary: string; addType: "question" | "decision" | "action"; addTitle: string; rationale: string }>>({});
  const draft = (session: Session) => drafts[session.id] ?? { notes: session.notes, summary: session.summary, addType: "question", addTitle: "", rationale: "" };
  const setDraft = (session: Session, next: Partial<ReturnType<typeof draft>>) => setDrafts((all) => ({ ...all, [session.id]: { ...draft(session), ...next } }));
  const toggle = (id: string, values: string[], setter: (value: string[]) => void) => setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);

  async function createSession() {
    setPending(true); setError(null);
    const result = await apiFetch(`/api/initiatives/${props.initiativeId}/refinement-sessions`, { method: "POST", body: { title, purpose, agenda, storyIds, bugIds, facilitatorUserId: props.members[0]?.id ?? null } });
    setPending(false); if (!result.ok) return setError(result.error ?? "Couldn't create refinement session.");
    setTitle(""); setPurpose(""); setAgenda(""); setStoryIds([]); setBugIds([]); router.refresh();
  }

  async function saveSession(session: Session, status?: string) {
    const current = draft(session); setPending(true); setError(null);
    const result = await apiFetch(`/api/refinement-sessions/${session.id}`, { method: "PATCH", body: { expectedRevision: session.revision, notes: current.notes, summary: current.summary, ...(status ? { status } : {}), reason: status ? `Session moved to ${status}` : "Refinement notes updated" } });
    setPending(false); if (!result.ok) return setError(result.error ?? "Couldn't update refinement session."); router.refresh();
  }

  async function addRecord(session: Session) {
    const current = draft(session); if (!current.addTitle.trim()) return;
    const data = current.addType === "question" ? { expectedRevision: session.revision, question: current.addTitle, answer: "" }
      : current.addType === "decision" ? { expectedRevision: session.revision, title: current.addTitle, rationale: current.rationale || "Decision recorded during refinement", decidedByUserId: props.members[0]?.id ?? null }
      : { expectedRevision: session.revision, title: current.addTitle, ownerUserId: props.members[0]?.id ?? null };
    setPending(true); setError(null);
    const result = await apiFetch(`/api/refinement-sessions/${session.id}`, { method: "POST", body: { action: current.addType, data } });
    setPending(false); if (!result.ok) return setError(result.error ?? "Couldn't record refinement item."); setDraft(session, { addTitle: "", rationale: "" }); router.refresh();
  }

  return <section className="mt-8 space-y-5"><div><h3 className="text-lg font-semibold">Refinement sessions</h3><p className="text-sm text-neutral-500">Prepare the meeting, capture engineering discussion, and retain decisions and follow-up work.</p></div>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="rounded-xl border bg-white p-4"><h4 className="font-semibold">Schedule a session</h4><div className="mt-3 grid gap-3 md:grid-cols-2"><Input placeholder="Session title" value={title} onChange={(event) => setTitle(event.target.value)} /><Input placeholder="Purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} /><Textarea className="md:col-span-2" placeholder="Agenda" value={agenda} onChange={(event) => setAgenda(event.target.value)} /></div><div className="mt-3 grid gap-4 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-500">Stories</p>{props.stories.map((item) => <label key={item.id} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={storyIds.includes(item.id)} onChange={() => toggle(item.id, storyIds, setStoryIds)} />{item.title}</label>)}</div><div><p className="text-xs font-semibold uppercase text-slate-500">Bugs</p>{props.bugs.map((item) => <label key={item.id} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={bugIds.includes(item.id)} onChange={() => toggle(item.id, bugIds, setBugIds)} />{item.title}</label>)}</div></div><Button className="mt-4" disabled={pending || !title.trim() || storyIds.length + bugIds.length === 0} onClick={createSession}>Create refinement session</Button></div>
    <div className="space-y-4">{props.sessions.map((session) => { const current = draft(session); return <article key={session.id} className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{session.title}</h4><p className="text-xs text-slate-500 capitalize">{session.status.replaceAll("_", " ")} · {session.items.length} items · Facilitator: {session.facilitator?.name ?? "Unassigned"}</p></div><div className="flex gap-2">{session.status === "scheduled" && <Button disabled={pending} onClick={() => saveSession(session, "in_progress")}>Start</Button>}{session.status === "in_progress" && <Button disabled={pending} onClick={() => saveSession(session, "completed")}>Complete</Button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{session.items.map((item) => <span key={item.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-800">{item.story?.title ?? requestTitle(item.bug?.request.data)}{item.bug ? ` · ${item.bug.severity}` : ""}</span>)}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><Textarea value={current.notes} onChange={(event) => setDraft(session, { notes: event.target.value })} placeholder="Meeting notes" /><Textarea value={current.summary} onChange={(event) => setDraft(session, { summary: event.target.value })} placeholder="Approved session summary" /></div><Button className="mt-2" variant="secondary" disabled={pending} onClick={() => saveSession(session)}>Save notes</Button><div className="mt-4 grid gap-2 md:grid-cols-[150px_1fr_1fr_auto]"><select className="rounded-lg border px-3 py-2 text-sm" value={current.addType} onChange={(event) => setDraft(session, { addType: event.target.value as typeof current.addType })}><option value="question">Question</option><option value="decision">Decision</option><option value="action">Action</option></select><Input placeholder={`${current.addType} text`} value={current.addTitle} onChange={(event) => setDraft(session, { addTitle: event.target.value })} />{current.addType === "decision" ? <Input placeholder="Rationale" value={current.rationale} onChange={(event) => setDraft(session, { rationale: event.target.value })} /> : <span />}<Button disabled={pending || !current.addTitle.trim()} onClick={() => addRecord(session)}>Add</Button></div><div className="mt-4 grid gap-3 md:grid-cols-3"><div><p className="text-xs font-semibold uppercase text-slate-500">Questions</p>{session.questions.map((item) => <p key={item.id} className="mt-1 text-sm">{item.question} <span className="text-xs text-slate-500">({item.status})</span></p>)}</div><div><p className="text-xs font-semibold uppercase text-slate-500">Decisions</p>{session.decisions.map((item) => <p key={item.id} className="mt-1 text-sm">{item.title}</p>)}</div><div><p className="text-xs font-semibold uppercase text-slate-500">Actions</p>{session.actions.map((item) => <p key={item.id} className="mt-1 text-sm">{item.title} <span className="text-xs text-slate-500">({item.status})</span></p>)}</div></div></article>; })}</div>
  </section>;
}
