"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch } from "@/lib/clientApi";

type Check = { checkKey: string; status: "pass" | "fail" | "review"; explanation: string };
type Item = {
  key: string; type: "story" | "bug"; id: string; title: string;
  estimatePoints: number; recommendedDecision: "ready" | "not_ready";
  latestDecision: string | null; latestReason: string | null; checks: Check[];
};
type Sprint = {
  id: string; label: string; capacityPoints: number;
  plan: { revision: number; status: string; goal: string; items: { storyId: string | null; bugId: string | null; estimatePoints: number }[] } | null;
};

const planKeys = (sprint: Sprint | undefined) => sprint?.plan?.items.map((item) =>
  item.storyId ? `story:${item.storyId}` : `bug:${item.bugId}`,
) ?? [];

export default function SprintPreparationBoard({ initiativeId, items, sprints, canEdit, canApprove, verbose }: {
  initiativeId: string; items: Item[]; sprints: Sprint[]; canEdit: boolean; canApprove: boolean; verbose: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState(sprints[0]?.id ?? "");
  const selectedSprint = sprints.find((sprint) => sprint.id === selectedSprintId);
  const [goal, setGoal] = useState(selectedSprint?.plan?.goal ?? "");
  const [selected, setSelected] = useState<string[]>(planKeys(selectedSprint));
  const [estimates, setEstimates] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries(items.map((item) => [item.key, item.estimatePoints])),
    ...Object.fromEntries(selectedSprint?.plan?.items.map((item) => [item.storyId ? `story:${item.storyId}` : `bug:${item.bugId}`, item.estimatePoints]) ?? []),
  }));
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const readyItems = items.filter((item) => ["ready", "overridden"].includes(item.latestDecision ?? ""));
  const selectedItems = readyItems.filter((item) => selected.includes(item.key));
  const total = selectedItems.reduce((sum, item) => sum + (estimates[item.key] ?? 0), 0);
  const overCapacity = selectedSprint != null && total > selectedSprint.capacityPoints;
  const missingEstimates = selectedItems.some((item) => !(estimates[item.key] > 0));
  const committed = selectedSprint?.plan?.status === "committed";
  const gaps = [
    ...(items.length === 0 ? ["No stories or bugs are available. Create or refine backlog work first."] : []),
    ...(sprints.length === 0 ? ["No sprint exists yet. Create a release and sprint before building a draft."] : []),
    ...(selectedSprint && selectedSprint.capacityPoints <= 0 ? ["Sprint capacity is missing. Review delivery assumptions before committing."] : []),
    ...(items.length > 0 && readyItems.length === 0 ? ["No work has a recorded sprint-ready decision yet. Review the checks below."] : []),
    ...(selectedSprint && goal.trim().length < 3 ? ["Add a specific sprint goal (at least three characters)."] : []),
    ...(selectedSprint && selectedItems.length === 0 ? ["Choose at least one sprint-ready story or bug."] : []),
    ...(missingEstimates ? ["Estimate every selected item before saving the draft."] : []),
    ...(overCapacity ? ["Selected work exceeds sprint capacity. Remove or re-estimate work before commitment."] : []),
  ];

  function chooseSprint(id: string) {
    const sprint = sprints.find((row) => row.id === id);
    setSelectedSprintId(id);
    setGoal(sprint?.plan?.goal ?? "");
    setSelected(planKeys(sprint));
    setEstimates((current) => ({ ...current, ...Object.fromEntries(sprint?.plan?.items.map((item) => [item.storyId ? `story:${item.storyId}` : `bug:${item.bugId}`, item.estimatePoints]) ?? []) }));
    setError(null); setMessage(null);
  }

  async function decide(item: Item, decision: "ready" | "not_ready" | "overridden") {
    const reason = decision === "overridden" ? (reasons[item.key] ?? "").trim() : decision === "ready"
      ? "All displayed readiness checks passed." : "Readiness gaps shown in the assessment remain open.";
    if (!canEdit) return;
    if (decision === "overridden" && reason.length < 5) return setError("Explain the readiness override before recording it.");
    setPending(true); setError(null); setMessage(null);
    const result = await apiFetch(`/api/initiatives/${initiativeId}/sprint-readiness`, {
      method: "POST", body: { target: { type: item.type, id: item.id }, decision, reason },
    });
    setPending(false);
    if (!result.ok) return setError(result.error ?? "Couldn't save the readiness decision.");
    setMessage(`${item.title}: readiness decision recorded.`);
    router.refresh();
  }

  async function save(commit: boolean) {
    if (!canEdit || !selectedSprint || committed || goal.trim().length < 3 || selectedItems.length === 0 || missingEstimates || (commit && overCapacity)) return;
    setPending(true); setError(null); setMessage(null);
    const result = await apiFetch(`/api/initiatives/${initiativeId}/sprint-plans`, {
      method: "POST", body: {
        sprintId: selectedSprint.id, expectedRevision: selectedSprint.plan?.revision ?? null,
        goal, cadence: selectedSprint.label, commit,
        items: selectedItems.map((item) => ({
          target: { type: item.type, id: item.id }, estimatePoints: estimates[item.key],
          carryoverReason: "", overrideReason: item.latestDecision === "overridden" ? (item.latestReason ?? "") : "",
        })),
      },
    });
    setPending(false);
    if (!result.ok) return setError(result.error ?? "Couldn't save the sprint plan.");
    setMessage(commit ? "Sprint plan committed." : "Draft saved. You can continue editing before commitment.");
    router.refresh();
  }

  return <div className="space-y-6">
    <div className="grid gap-3 md:grid-cols-3" aria-label="Sprint planning steps">
      {["1 · Check readiness", "2 · Shape the sprint", "3 · Review and commit"].map((step) =>
        <div key={step} className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-sm font-semibold text-indigo-900">{step}</div>
      )}
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

    <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="sprint-readiness-heading">
      <h3 id="sprint-readiness-heading" className="text-lg font-semibold">1. Check what is sprint-ready</h3>
      <p className="mt-1 text-sm text-slate-600">The checks use current stories, criteria, estimates, refinement, priorities, owners, blockers, and dependencies. A Product Owner records the decision; the system does not silently approve work.</p>
      {verbose && <p className="mt-2 text-sm text-slate-600">Start with each candidate below. Red checks are missing evidence; amber checks need judgment. Use the linked story or refinement workspace to resolve gaps, then return here to record a fresh decision.</p>}
      {items.length === 0 && <p className="mt-4 text-sm text-amber-800">No candidate work yet. <Link className="font-semibold underline" href={`/initiatives/${initiativeId}/workspace/epics`}>Open stories</Link> or <Link className="font-semibold underline" href={`/initiatives/${initiativeId}/requests`}>review intake requests</Link>.</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{items.map((item) => <article key={item.key} className="min-w-0 rounded-xl border p-4">
        <h4 className="break-words font-semibold">{item.title}</h4>
        <p className="mt-1 text-xs text-slate-500">{item.type} · suggested: {item.recommendedDecision.replaceAll("_", " ")} · PO decision: {item.latestDecision?.replaceAll("_", " ") ?? "not recorded"}</p>
        <ul className="mt-3 space-y-1">{item.checks.map((check) => <li key={check.checkKey} className={`text-xs ${check.status === "pass" ? "text-emerald-700" : check.status === "fail" ? "text-red-700" : "text-amber-700"}`}><b className="uppercase">{check.status}</b> — {check.explanation}</li>)}</ul>
        {item.recommendedDecision !== "ready" && canApprove && <label className="mt-3 block text-xs font-medium">Reason for an override
          <textarea className="mt-1 w-full rounded-lg border p-2 text-sm" value={reasons[item.key] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.key]: event.target.value }))} placeholder="Why is this safe to bring into the sprint despite the gaps?" />
        </label>}
        {canEdit && <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={pending} onClick={() => void decide(item, "not_ready")}>Not ready</Button>{item.recommendedDecision === "ready" && canApprove && <Button disabled={pending} onClick={() => void decide(item, "ready")}>Mark sprint-ready</Button>}{item.recommendedDecision !== "ready" && canApprove && <Button disabled={pending || (reasons[item.key] ?? "").trim().length < 5} onClick={() => void decide(item, "overridden")}>Override with reason</Button>}</div>}
      </article>)}</div>
      <p className="mt-4 text-sm text-slate-600">Need to resolve gaps? <Link className="font-semibold text-indigo-700 underline" href={`/initiatives/${initiativeId}/workspace/refinement`}>Open refinement</Link> or <Link className="font-semibold text-indigo-700 underline" href={`/initiatives/${initiativeId}/workspace/epics`}>edit stories and criteria</Link>.</p>
    </section>

    <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="sprint-plan-heading">
      <h3 id="sprint-plan-heading" className="text-lg font-semibold">2. Build an editable sprint draft</h3>
      <p className="mt-1 text-sm text-slate-600">Choose the sprint, state the outcome, then select assessed work. Points are editable here for planning; story estimates themselves should be corrected in the story.</p>
      {verbose && <p className="mt-2 text-sm text-slate-600">A sprint goal describes the usable result the team intends to deliver, not just a list of tasks. Keep selected points within the displayed capacity; historical velocity is helpful if your team has it.</p>}
      {sprints.length === 0 ? <p className="mt-4 text-sm text-amber-800">Create a release and sprint in <Link className="font-semibold underline" href={`/initiatives/${initiativeId}/workspace/sprints`}>Sprints &amp; Releases</Link> first.</p> : <>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Sprint
          <select className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm" value={selectedSprintId} onChange={(event) => chooseSprint(event.target.value)}>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.label}</option>)}</select>
        </label><label className="text-sm font-medium">Sprint goal<Input className="mt-1" placeholder="What usable outcome should this sprint deliver?" value={goal} onChange={(event) => setGoal(event.target.value)} disabled={committed || !canEdit} /></label></div>
        {committed && <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">This sprint plan is committed and cannot be edited here. Choose another sprint to plan upcoming work.</p>}
        <div className="mt-4 space-y-2">{readyItems.length === 0 ? <p className="text-sm text-slate-500">Record a sprint-ready decision above to make work selectable.</p> : readyItems.map((item) => <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <label className="flex min-w-0 flex-1 items-start gap-2"><input className="mt-1" type="checkbox" disabled={committed || !canEdit} checked={selected.includes(item.key)} onChange={() => setSelected((all) => all.includes(item.key) ? all.filter((key) => key !== item.key) : [...all, item.key])} /><span className="break-words">{item.title}{item.latestDecision === "overridden" && <span className="ml-1 text-amber-700">(override)</span>}</span></label>
          <label className="flex items-center gap-2 text-xs">Points<input type="number" min="0.5" max="1000" step="0.5" disabled={committed || !canEdit} aria-label={`${item.title} estimate in points`} className="w-20 rounded border p-2 text-sm" value={estimates[item.key] || ""} onChange={(event) => setEstimates((current) => ({ ...current, [item.key]: Number(event.target.value) }))} /></label>
        </div>)}</div>
        <p className={`mt-4 text-sm font-semibold ${overCapacity ? "text-red-700" : "text-emerald-700"}`}>{total} / {selectedSprint?.capacityPoints ?? 0} points planned {overCapacity ? "· over capacity" : "· within capacity"}</p>
      </>}
    </section>

    <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="sprint-review-heading">
      <h3 id="sprint-review-heading" className="text-lg font-semibold">3. Review gaps and commit when ready</h3>
      <p className="mt-1 text-sm text-slate-600">A draft is a proposal you can revise. Commitment is a separate Product Owner decision.</p>
      {verbose && <p className="mt-2 text-sm text-slate-600">Saving a draft does not assign or commit work. Review the goal, selected items, unresolved risks, and capacity with your team before the authorized approver commits.</p>}
      {gaps.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-800">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p className="mt-4 text-sm text-emerald-700">Core sprint-planning inputs are present. Review the work and capacity before committing.</p>}
      {canEdit && <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={pending || committed || !selectedSprint || goal.trim().length < 3 || selectedItems.length === 0 || missingEstimates} onClick={() => void save(false)}>Save editable draft</Button>{canApprove && <Button disabled={pending || committed || gaps.length > 0} onClick={() => void save(true)}>Commit sprint plan</Button>}</div>}
      {canEdit && !canApprove && <p className="mt-3 text-xs text-slate-500">You can prepare the draft. Organization Owner or Admin approval is currently required to mark work ready and commit the plan.</p>}
    </section>

    {canEdit && <AiAssistPanel initiativeId={initiativeId} scope="sprints" />}
  </div>;
}
