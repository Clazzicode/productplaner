"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

type BacklogOption = { id: string; name: string; featureCount: number };

export default function BacklogConnectionPicker({ featureId, currentBacklogId, backlogs, canEdit }: {
  featureId: string;
  currentBacklogId: string | null;
  backlogs: BacklogOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(currentBacklogId ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = backlogs.find(backlog => backlog.id === currentBacklogId);

  async function save(body: { action: "select"; backlogId: string } | { action: "create"; name: string }) {
    setBusy(true);
    setError("");
    const result = await apiFetch(`/api/initiatives/${featureId}/backlog-connection`, { method: "PATCH", body });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not connect the backlog."); return; }
    setNewName("");
    router.refresh();
  }

  return <section aria-labelledby="feature-backlog-heading" className="mx-auto mt-5 max-w-[1220px] rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="feature-backlog-heading" className="font-semibold text-[#0d1b3e]">Connected backlog</h2>
        <p className="mt-1 text-sm text-slate-600">{current ? current.name : "No backlog selected"}</p>
      </div>
      {current && <Link href={`/backlogs/${current.id}`} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">View shared backlog →</Link>}
    </div>
    {canEdit && <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <label className="text-sm font-medium text-slate-800">Choose a backlog in this product
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Choose a backlog</option>
          {backlogs.map(backlog => <option key={backlog.id} value={backlog.id}>{backlog.name} ({backlog.featureCount} {backlog.featureCount === 1 ? "feature" : "features"})</option>)}
        </select>
      </label>
      <button type="button" disabled={busy || !selectedId || selectedId === currentBacklogId} onClick={() => void save({ action: "select", backlogId: selectedId })} className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Connect feature</button>
      <label className="text-sm font-medium text-slate-800">Or create a new backlog
        <input value={newName} onChange={event => setNewName(event.target.value)} maxLength={160} placeholder="Backlog name" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </label>
      <button type="button" disabled={busy || newName.trim().length < 3} onClick={() => void save({ action: "create", name: newName })} className="self-end rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Create and connect</button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
