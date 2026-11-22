"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export default function BacklogConnectionPicker({ featureId, backlog, canEdit }: {
  featureId: string;
  backlog: { id: string; name: string } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(backlog?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const result = await apiFetch(`/api/initiatives/${featureId}/backlog-connection`, {
      method: "PATCH", body: { action: backlog ? "rename" : "create", name: name.trim() },
    });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not save the backlog."); return; }
    setEditing(false);
    router.refresh();
  }

  return <section aria-labelledby="feature-backlog-heading" className="mx-auto mt-5 max-w-[1220px] rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 id="feature-backlog-heading" className="font-semibold text-[#0d1b3e]">This feature’s backlog</h2>
        <p className="mt-1 text-sm text-slate-600">{backlog?.name ?? "No backlog connected yet"}</p>
        <p className="mt-1 text-xs text-slate-500">Work planned for this feature stays in its own backlog.</p>
      </div>
      {backlog && <Link href={`/initiatives/${featureId}/backlog`} className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">Open backlog →</Link>}
    </div>
    {canEdit && <div className="mt-4 border-t border-slate-200 pt-4">
      {!editing ? <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{backlog ? "Rename backlog" : "Create backlog"}</button> : <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1 text-sm font-medium text-slate-800">Backlog name
          <input value={name} onChange={event => setName(event.target.value)} maxLength={160} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="button" disabled={busy || name.trim().length < 3 || name.trim() === backlog?.name} onClick={() => void save()} className="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
        <button type="button" onClick={() => { setEditing(false); setName(backlog?.name ?? ""); setError(""); }} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
      </div>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
