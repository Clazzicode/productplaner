"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type Member = { id: string; name: string };
type Finding = {
  id: string;
  category: string;
  title: string;
  detail: string;
  status: string;
  resolution: string;
  followUpNote: string;
  followUpAt: string | Date | null;
  revision: number;
  ownerUserId: string | null;
  sourceType: string;
  story: { id: string; title: string };
};

const categoryLabel = (value: string) => value.replace(/_/g, " ");

function FindingCard({ finding, members }: { finding: Finding; members: Member[] }) {
  const router = useRouter();
  const [ownerUserId, setOwnerUserId] = useState(finding.ownerUserId ?? "");
  const [resolution, setResolution] = useState(finding.resolution);
  const [followUpNote, setFollowUpNote] = useState(finding.followUpNote);
  const [followUpAt, setFollowUpAt] = useState(
    finding.followUpAt ? new Date(finding.followUpAt).toISOString().slice(0, 10) : "",
  );
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Array<{
    id: string;
    toRevision: number;
    reason: string;
    createdAt: string;
    actorUser: { name: string } | null;
  }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(status = finding.status) {
    if (reason.trim().length < 3) {
      setError("Explain why this finding is changing.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await apiFetch(`/api/refinement-findings/${finding.id}`, {
      method: "PATCH",
      body: {
        expectedRevision: finding.revision,
        reason,
        ownerUserId: ownerUserId || null,
        resolution,
        followUpNote,
        followUpAt: followUpAt ? new Date(`${followUpAt}T12:00:00Z`).toISOString() : null,
        status,
      },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not update this finding.");
    router.refresh();
  }

  async function loadHistory() {
    if (history) return setHistory(null);
    setBusy(true);
    setError("");
    const result = await apiFetch<{ history: typeof history }>(
      `/api/refinement-findings/${finding.id}`,
    );
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not load finding history.");
    setHistory(result.data?.history ?? []);
  }

  return <article className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{categoryLabel(finding.category)} · {finding.sourceType}</p><h4 className="mt-1 font-semibold text-slate-900">{finding.title}</h4><p className="mt-1 text-sm text-slate-600">{finding.detail}</p><p className="mt-2 text-xs text-slate-500">Story: {finding.story.title}</p></div>
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${finding.status === "resolved" ? "bg-emerald-100 text-emerald-800" : finding.status === "dismissed" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{finding.status}</span>
    </div>
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      <select aria-label={`Owner for ${finding.title}`} value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="rounded border border-slate-300 bg-white p-2 text-sm"><option value="">Unassigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <input aria-label={`Resolution for ${finding.title}`} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Resolution or follow-up note" className="rounded border border-slate-300 p-2 text-sm" />
      <input aria-label={`Follow-up for ${finding.title}`} value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} placeholder="Next action or question for engineering" className="rounded border border-slate-300 p-2 text-sm" />
      <input aria-label={`Follow-up date for ${finding.title}`} type="date" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="rounded border border-slate-300 p-2 text-sm" />
      <input aria-label={`Change reason for ${finding.title}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this changing?" className="rounded border border-slate-300 p-2 text-sm md:col-span-2" />
      <div className="flex flex-wrap gap-2 md:col-span-2"><button type="button" disabled={busy} onClick={() => save("open")} className="rounded border px-3 py-2 text-xs font-semibold">Save</button><button type="button" disabled={busy || !resolution.trim()} onClick={() => save("resolved")} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolve</button>{finding.status !== "dismissed" && <button type="button" disabled={busy} onClick={() => save("dismissed")} className="rounded border px-3 py-2 text-xs font-semibold text-slate-600">Dismiss</button>}<button type="button" disabled={busy} onClick={loadHistory} className="rounded border px-3 py-2 text-xs font-semibold text-indigo-700">{history ? "Hide history" : `History · v${finding.revision}`}</button></div>
    </div>
    {history && <ol className="mt-3 space-y-2 border-t pt-3 text-xs text-slate-600">{history.length === 0 ? <li>No earlier revisions.</li> : history.map(item => <li key={item.id}><strong>v{item.toRevision}</strong> · {item.reason} · {item.actorUser?.name ?? "System"} · {new Date(item.createdAt).toLocaleString()}</li>)}</ol>}
    {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
  </article>;
}

export default function RefinementFindingBoard({ findings, members }: { findings: Finding[]; members: Member[] }) {
  if (findings.length === 0) return <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">No tracked findings yet. Run an AI refinement review and apply the findings you want to track.</p>;
  return <div className="space-y-3">{findings.map(finding => <FindingCard key={finding.id} finding={finding} members={members} />)}</div>;
}
