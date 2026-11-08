"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import type { ReconciliationItem } from "@/lib/generation/reconciliation";
import type { RegenerationDecision } from "@/lib/generation/proposals";

type Proposal = { id: string; status: string; recordFingerprint: string; payload: {
  items: ReconciliationItem[]; approvedBaseline: boolean; retainedSprintIds: string[]; retainedReleaseIds: string[];
  candidateRecords: { id: string; title: string; body: string }[];
} };

export default function RegenerationReview({ initiativeId, proposals }: { initiativeId: string; proposals: Proposal[] }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, RegenerationDecision>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function apply(proposal: Proposal) {
    setBusy(true); setMessage(null);
    const result = await apiFetch(`/api/initiatives/${initiativeId}/regeneration-proposals/${proposal.id}`, { method: "POST", body: {
      expectedFingerprint: proposal.recordFingerprint,
      decisions: proposal.payload.items.map(item => choices[`${proposal.id}:${item.key}`] ?? { key: item.key, action: "keep" }),
    } });
    setBusy(false);
    setMessage(result.ok ? "Reviewed changes applied. Existing identities, edits, delivery assignments and Jira links were retained. Final approval must be renewed." : result.error ?? "Application failed.");
    if (result.ok) router.refresh();
  }
  return <section className="space-y-5">
    <h1 className="text-xl font-semibold">Review regeneration</h1>
    <Link className="text-indigo-700 underline" href={`/initiatives/${initiativeId}/workspace/features`}>Back to features and backlog</Link>
    <p>Nothing changes until you apply your selections. Every item defaults to Keep. Manual text and delivery assignments are preserved; uncertain legacy identities require your mapping decision.</p>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    {!proposals.length && <p>No regeneration proposals yet. Use “Propose regeneration” from your planning workspace.</p>}
    {proposals.map(proposal => <article key={proposal.id} className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Proposal {proposal.id} · {proposal.status}</h2>
      <p className="text-sm">Retains {proposal.payload.retainedSprintIds.length} sprint(s) and {proposal.payload.retainedReleaseIds.length} release(s). {proposal.payload.approvedBaseline && "Applying changes reopens the approved plan for final approval."}</p>
      <p className="text-sm">{proposal.payload.items.filter(item => item.kind === "add").length} additions · {proposal.payload.items.filter(item => item.kind === "change").length} changes · {proposal.payload.items.filter(item => item.kind === "mapping_required").length} mapping reviews · {proposal.payload.items.filter(item => item.kind === "orphan").length} missing-source reviews</p>
      {proposal.payload.items.map(item => {
        const choiceKey = `${proposal.id}:${item.key}`;
        const selected = choices[choiceKey];
        return <details key={item.key} className="rounded border p-3">
          <summary>{item.proposed?.title ?? item.before?.title ?? item.key} · {item.kind.replaceAll("_", " ")}</summary>
          <p className="mt-2 text-sm">Record: {item.targetId ?? "not mapped"}. Preserved fields: {item.preservedFields.join(", ") || "none changed"}.</p>
          <div className="grid gap-3 md:grid-cols-2"><div><h3 className="font-medium">Current</h3><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.before, null, 2)}</pre></div><div><h3 className="font-medium">Proposed generated content</h3><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.proposed, null, 2)}</pre><p className="text-sm">Eligible field changes: {Object.keys(item.changes).join(", ") || "none"}</p></div></div>
          {proposal.status === "pending" && <label className="mt-3 block text-sm">Decision
            <select className="ml-2 max-w-full rounded border p-2" disabled={busy} value={selected?.action === "map" ? `map:${selected.targetId}` : selected?.action ?? "keep"}
              onChange={event => { const value = event.target.value; setChoices(previous => ({ ...previous, [choiceKey]: value.startsWith("map:") ? { key: item.key, action: "map", targetId: value.slice(4) } : { key: item.key, action: value as "keep" | "apply" } })); }}>
              <option value="keep">Keep existing work / skip addition</option>
              {(item.kind === "add" || item.kind === "change") && <option value="apply">{item.kind === "add" ? "Add this generated record" : "Apply eligible generated field changes"}</option>}
              {item.kind === "mapping_required" && item.candidateIds.map(id => <option key={id} value={`map:${id}`}>Map to {proposal.payload.candidateRecords.find(row => row.id === id)?.title ?? id} ({id}) — preserve content</option>)}
            </select>
          </label>}
          {item.kind === "mapping_required" && <details><summary>Inspect mapping candidates</summary>{item.candidateIds.map(id => <pre key={id} className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(proposal.payload.candidateRecords.find(row => row.id === id), null, 2)}</pre>)}</details>}
          {item.kind === "orphan" && <p>This record remains intact and will be marked for source review. No archival or deletion is performed.</p>}
        </details>;
      })}
      {proposal.status === "pending" && <button disabled={busy} className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void apply(proposal)}>{busy ? "Applying…" : "Apply reviewed selections"}</button>}
    </article>)}
  </section>;
}
