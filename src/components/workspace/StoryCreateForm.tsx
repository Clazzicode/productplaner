"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

export default function StoryCreateForm({ initiativeId, epicId }: { initiativeId: string; epicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const result = await apiFetch(`/api/initiatives/${initiativeId}/stories`, {
      method: "POST",
      body: { epicId, title, body, sourceType: "manual", externalRef: null, points: null },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the story.");
      return;
    }
    setOpen(false);
    setTitle("");
    setBody("");
    router.refresh();
  }

  if (!open) {
    return <div className="mt-3">
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-indigo-700">+ Create story</button>
      <p className="mt-1 text-[11px] text-neutral-500">Jira story import will be enabled with the live Jira integration in Feature 21.</p>
    </div>;
  }

  return <div className="mt-3 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
    <p className="text-xs font-semibold text-indigo-950">Create a story manually</p>
    <input aria-label="Story title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Story title" className="w-full rounded border p-2 text-sm" />
    <textarea aria-label="Story outcome" value={body} onChange={(event) => setBody(event.target.value)} placeholder="As a …, I want …, so that …" className="w-full rounded border p-2 text-sm" rows={3} />
    {error && <p className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2">
      <button type="button" disabled={busy || title.trim().length < 3 || !body.trim()} onClick={save} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create story"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs">Cancel</button>
    </div>
  </div>;
}
