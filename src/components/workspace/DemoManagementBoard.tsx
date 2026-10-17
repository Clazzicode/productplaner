"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type WorkItem = { key: string; type: "story" | "bug"; id: string; title: string; capabilityId: string | null; sprintId: string; sprintLabel: string };
type Sprint = { id: string; label: string };
type Stakeholder = { id: string; displayName: string };
type Revision = { id: string; reason: string; fromRevision: number; toRevision: number; createdAt: string; actor: { name: string } | null };
type Suggestion = { id: string; kind: "purpose" | "completed_work"; content: string; informationUsed: string; status: string; createdAt: string };
type Demo = {
  id: string; sprintId: string; storyId: string | null; bugId: string | null; title: string; purpose: string;
  presenterStakeholderId: string | null; presenterNameSnapshot: string; status: string; readinessReason: string;
  blockingReason: string; overrideReason: string; notes: string; completedWork: string; plannedOrder: number;
  repeatReason: string; evidenceLinks: unknown; carryoverReason: string; revision: number; blockerCount: number;
  clarificationCount: number; sprint: { sprintNumber: number }; story: { title: string } | null;
  bug: { request: { data: unknown } } | null; capability: { name: string } | null; revisions: Revision[]; aiSuggestions: Suggestion[];
};

const STATUS_LABELS: Record<string, string> = { proposed: "Proposed", preparing: "Preparing", ready: "Ready", not_ready: "Not ready", demonstrated: "Demonstrated", skipped: "Skipped", carried_over: "Carryover" };
function links(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

function DemoCard(props: { demo: Demo; stakeholders: Stakeholder[]; sprints: Sprint[]; canEdit: boolean; canDecide: boolean; canMoveEarlier: boolean; canMoveLater: boolean; onMove: (delta: -1 | 1) => void }) {
  const { demo } = props; const router = useRouter(); const [pending, start] = useTransition();
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ title: demo.title, purpose: demo.purpose, presenterStakeholderId: demo.presenterStakeholderId ?? "", completedWork: demo.completedWork, plannedOrder: demo.plannedOrder, evidenceLinks: links(demo.evidenceLinks), notes: demo.notes });
  const [reason, setReason] = useState("Demo preparation updated"); const [readinessReason, setReadinessReason] = useState(demo.readinessReason);
  const [blockingReason, setBlockingReason] = useState(demo.blockingReason); const [overrideReason, setOverrideReason] = useState(demo.overrideReason);
  const [targetSprintId, setTargetSprintId] = useState(""); const [carryoverReason, setCarryoverReason] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(demo.aiSuggestions.find(item => item.status === "proposed") ?? null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(""); setMessage(""); start(async () => { const result = await work(); if (!result.ok) setError(result.error ?? "Request failed."); else { setMessage(success); router.refresh(); } });
  }
  const patch = (body: Record<string, unknown>, success: string) => run(() => apiFetch(`/api/demos/${demo.id}`, { method: "PATCH", body: { expectedRevision: demo.revision, ...body } }), success);
  function save(suggestion?: Suggestion) {
    patch({ action: "update", ...draft, presenterStakeholderId: draft.presenterStakeholderId || null,
      evidenceLinks: draft.evidenceLinks.split(/\r?\n/).map(x => x.trim()).filter(Boolean), reason,
      suggestionId: suggestion?.id ?? null, suggestionKind: suggestion?.kind ?? null }, "Demo preparation saved.");
  }
  function generate(kind: "purpose" | "completed_work") {
    run(async () => {
      const result = await apiFetch<{ suggestion: Suggestion }>(`/api/demos/${demo.id}/draft`, { method: "POST", body: { kind } });
      if (result.ok && result.data?.suggestion) { const suggestion = result.data.suggestion; setActiveSuggestion(suggestion); setDraft(current => ({ ...current, [kind === "purpose" ? "purpose" : "completedWork"]: suggestion.content })); }
      return result;
    }, "AI draft prepared. Review it, then save or dismiss it.");
  }
  function dismiss() {
    if (!activeSuggestion) return;
    run(async () => { const result = await apiFetch(`/api/demo-suggestions/${activeSuggestion.id}`, { method: "PATCH", body: { action: "dismiss" } }); if (result.ok) setActiveSuggestion(null); return result; }, "AI draft dismissed.");
  }
  const availableCarryover = props.sprints.filter(sprint => sprint.id !== demo.sprintId);
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Sprint {demo.sprint.sprintNumber} · #{demo.plannedOrder + 1}</p><h4 className="font-semibold text-slate-900">{demo.title}</h4><p className="text-xs text-slate-500">{demo.story ? `Story: ${demo.story.title}` : "Bug"}{demo.capability ? ` · Feature: ${demo.capability.name}` : ""}</p></div><div className="flex items-center gap-2">{props.canDecide && <><button type="button" aria-label="Move demo earlier" disabled={pending || !props.canMoveEarlier} onClick={() => props.onMove(-1)} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-40">↑</button><button type="button" aria-label="Move demo later" disabled={pending || !props.canMoveLater} onClick={() => props.onMove(1)} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-40">↓</button></>}<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{STATUS_LABELS[demo.status] ?? demo.status}</span></div></div>
    {(demo.blockerCount > 0 || demo.clarificationCount > 0) && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Open evidence: {demo.blockerCount} blocker(s), {demo.clarificationCount} clarification(s). An owner/admin must resolve them or record an override before readiness.</p>}
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-medium">Title<input disabled={!props.canEdit || pending} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full rounded border p-2 text-sm" /></label>
      <label className="text-xs font-medium">Presenter<select disabled={!props.canEdit || pending} value={draft.presenterStakeholderId} onChange={e => setDraft({ ...draft, presenterStakeholderId: e.target.value })} className="mt-1 w-full rounded border p-2 text-sm"><option value="">Unassigned</option>{props.stakeholders.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
      <label className="text-xs font-medium md:col-span-2">Why this matters<textarea disabled={!props.canEdit || pending} value={draft.purpose} onChange={e => setDraft({ ...draft, purpose: e.target.value })} className="mt-1 min-h-20 w-full rounded border p-2 text-sm" /></label>
      <label className="text-xs font-medium md:col-span-2">Completed work<textarea disabled={!props.canEdit || pending} value={draft.completedWork} onChange={e => setDraft({ ...draft, completedWork: e.target.value })} className="mt-1 min-h-20 w-full rounded border p-2 text-sm" /></label>
      <label className="text-xs font-medium">Agenda order<input disabled={!props.canDecide || pending} type="number" min={0} value={draft.plannedOrder} onChange={e => setDraft({ ...draft, plannedOrder: Number(e.target.value) })} className="mt-1 w-full rounded border p-2 text-sm" /></label>
      <label className="text-xs font-medium">Evidence links, one per line<textarea disabled={!props.canEdit || pending} value={draft.evidenceLinks} onChange={e => setDraft({ ...draft, evidenceLinks: e.target.value })} className="mt-1 min-h-16 w-full rounded border p-2 text-sm" /></label>
      <label className="text-xs font-medium md:col-span-2">Demo notes<textarea disabled={!props.canEdit || pending} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} className="mt-1 min-h-16 w-full rounded border p-2 text-sm" /></label>
    </div>
    {props.canEdit && !["demonstrated", "skipped", "carried_over"].includes(demo.status) && <div className="mt-3 flex flex-wrap gap-2"><button disabled={pending} onClick={() => generate("purpose")} className="rounded border px-3 py-1.5 text-xs font-semibold">Draft purpose with AI</button><button disabled={pending} onClick={() => generate("completed_work")} className="rounded border px-3 py-1.5 text-xs font-semibold">Draft completed work with AI</button></div>}
    {activeSuggestion && <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm"><p className="font-semibold">AI suggestion for {activeSuggestion.kind === "purpose" ? "purpose" : "completed work"}</p><p className="mt-1 whitespace-pre-wrap">{activeSuggestion.content}</p><p className="mt-2 text-xs text-slate-600">Based on: {activeSuggestion.informationUsed}</p><div className="mt-2 flex gap-2"><button disabled={pending} onClick={() => save(activeSuggestion)} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Use edited draft</button><button disabled={pending} onClick={dismiss} className="rounded border px-3 py-1.5 text-xs font-semibold">Dismiss</button></div></div>}
    {props.canEdit && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-56 flex-1 text-xs font-medium">Change reason<input value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm" /></label><button disabled={pending} onClick={() => save()} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Save preparation</button></div>}
    {props.canDecide && !["demonstrated", "skipped", "carried_over"].includes(demo.status) && <div className="mt-4 grid gap-2 border-t pt-4 md:grid-cols-3"><input value={readinessReason} onChange={e => setReadinessReason(e.target.value)} placeholder="Readiness rationale" className="rounded border p-2 text-sm" /><input value={blockingReason} onChange={e => setBlockingReason(e.target.value)} placeholder="Not-ready reason" className="rounded border p-2 text-sm" /><input value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Override unresolved evidence" className="rounded border p-2 text-sm" /><div className="flex gap-2 md:col-span-3"><button disabled={pending} onClick={() => patch({ action: "decide", status: "ready", readinessReason, blockingReason: "", overrideReason, reason: "Demo marked ready" }, "Demo marked ready.")} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Mark ready</button><button disabled={pending} onClick={() => patch({ action: "decide", status: "not_ready", readinessReason, blockingReason, overrideReason: "", reason: "Demo marked not ready" }, "Demo marked not ready.")} className="rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Mark not ready</button></div></div>}
    {props.canDecide && demo.status === "ready" && <div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => patch({ action: "outcome", status: "demonstrated", notes: draft.notes, reason: "Demo completed" }, "Demo completed.")} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Mark demonstrated</button><button disabled={pending} onClick={() => patch({ action: "outcome", status: "skipped", notes: draft.notes, reason: "Demo skipped" }, "Demo skipped.")} className="rounded border px-3 py-2 text-xs font-semibold">Skip</button></div>}
    {props.canDecide && ["ready", "not_ready", "skipped"].includes(demo.status) && availableCarryover.length > 0 && <div className="mt-4 grid gap-2 border-t pt-4 md:grid-cols-[1fr_2fr_auto]"><select value={targetSprintId} onChange={e => setTargetSprintId(e.target.value)} className="rounded border p-2 text-sm"><option value="">Carry over to…</option>{availableCarryover.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select><input value={carryoverReason} onChange={e => setCarryoverReason(e.target.value)} placeholder="Why it is moving" className="rounded border p-2 text-sm" /><button disabled={pending || !targetSprintId} onClick={() => patch({ action: "carryover", targetSprintId, carryoverReason, reason: "Demo carried over" }, "Demo carried over.")} className="rounded border px-3 py-2 text-xs font-semibold">Carry over</button></div>}
    {demo.carryoverReason && <p className="mt-3 text-xs text-slate-600">Carryover reason: {demo.carryoverReason}</p>}
    {demo.revisions.length > 0 && <details className="mt-4 border-t pt-3 text-xs"><summary className="cursor-pointer font-semibold">History ({demo.revisions.length})</summary><ul className="mt-2 space-y-1">{demo.revisions.map(item => <li key={item.id}>v{item.fromRevision}→v{item.toRevision}: {item.reason} · {item.actor?.name ?? "System"}</li>)}</ul></details>}
    {error && <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}{message && <p className="mt-3 rounded bg-emerald-50 p-2 text-xs text-emerald-700">{message}</p>}
  </article>;
}

export default function DemoManagementBoard(props: { initiativeId: string; workItems: WorkItem[]; sprints: Sprint[]; stakeholders: Stakeholder[]; demos: Demo[]; canEdit: boolean; canDecide: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const [workKey, setWorkKey] = useState(props.workItems[0]?.key ?? ""); const [title, setTitle] = useState(props.workItems[0]?.title ?? ""); const [repeatReason, setRepeatReason] = useState("");
  const selected = props.workItems.find(item => item.key === workKey);
  const bySprint = useMemo(() => props.sprints.map(sprint => ({ ...sprint, demos: props.demos.filter(demo => demo.sprintId === sprint.id).sort((a,b) => a.plannedOrder - b.plannedOrder) })).filter(group => group.demos.length > 0), [props.sprints, props.demos]);
  function create() { if (!selected) return; setError(""); start(async () => { const result = await apiFetch(`/api/initiatives/${props.initiativeId}/demos`, { method: "POST", body: { sprintId: selected.sprintId, storyId: selected.type === "story" ? selected.id : null, bugId: selected.type === "bug" ? selected.id : null, capabilityId: selected.capabilityId, title, purpose: "", presenterStakeholderId: null, notes: "", completedWork: "", plannedOrder: props.demos.filter(d => d.sprintId === selected.sprintId).length, repeatReason, evidenceLinks: [] } }); if (!result.ok) setError(result.error ?? "Could not add demo item."); else { setRepeatReason(""); router.refresh(); } }); }
  function move(group: { id: string; demos: Demo[] }, demoId: string, delta: -1 | 1) { const current = group.demos.findIndex(demo => demo.id === demoId); const target = current + delta; if (current < 0 || target < 0 || target >= group.demos.length) return; const ordered = [...group.demos]; [ordered[current], ordered[target]] = [ordered[target], ordered[current]]; setError(""); start(async () => { const result = await apiFetch(`/api/initiatives/${props.initiativeId}/demos/reorder`, { method: "PATCH", body: { sprintId: group.id, items: ordered.map(demo => ({ id: demo.id, expectedRevision: demo.revision })), reason: "Demo agenda reordered" } }); if (!result.ok) setError(result.error ?? "Could not reorder the demo agenda."); else router.refresh(); }); }
  return <div className="space-y-8">
    {props.canEdit && <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5"><h3 className="font-semibold">Add committed work to the demo</h3><p className="mt-1 text-sm text-slate-600">Only work from a committed sprint plan is available. Each story or bug can appear once unless you record why a repeat demo is needed.</p><div className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_2fr_auto]"><select value={workKey} onChange={e => { setWorkKey(e.target.value); setTitle(props.workItems.find(item => item.key === e.target.value)?.title ?? ""); }} className="rounded border p-2 text-sm">{props.workItems.length === 0 && <option value="">No committed work available</option>}{props.workItems.map(item => <option key={item.key} value={item.key}>{item.sprintLabel}: {item.title}</option>)}</select><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Demo title" className="rounded border p-2 text-sm" /><input value={repeatReason} onChange={e => setRepeatReason(e.target.value)} placeholder="Repeat reason, only when needed" className="rounded border p-2 text-sm" /><button disabled={pending || !selected} onClick={create} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add demo</button></div>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</section>}
    {bySprint.length === 0 ? <section className="rounded-xl border border-dashed p-8 text-center"><h3 className="font-semibold">No demo agenda yet</h3><p className="mt-1 text-sm text-slate-500">Commit a sprint plan, then add its stories and bugs here.</p></section> : bySprint.map(group => <section key={group.id}><h3 className="text-lg font-bold">{group.label}</h3><div className="mt-4 grid gap-5 xl:grid-cols-2">{group.demos.map((demo,index) => <DemoCard key={demo.id} demo={demo} stakeholders={props.stakeholders} sprints={props.sprints} canEdit={props.canEdit} canDecide={props.canDecide} canMoveEarlier={index > 0} canMoveLater={index < group.demos.length - 1} onMove={delta => move(group,demo.id,delta)} />)}</div></section>)}
  </div>;
}
