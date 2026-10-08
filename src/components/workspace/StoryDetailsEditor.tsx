"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type EpicOption = { id: string; label: string };

export default function StoryDetailsEditor(props: {
  initiativeId: string;
  story: {
    id: string;
    title: string;
    body: string;
    points: number | null;
    readinessStatus: string;
    parentId: string;
    backlogRevision: number;
    archived: boolean;
  };
  epics: EpicOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.story.title);
  const [body, setBody] = useState(props.story.body);
  const [points, setPoints] = useState<number | null>(props.story.points);
  const [epicId, setEpicId] = useState(props.story.parentId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(changes: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const result = await apiFetch(
      `/api/initiatives/${props.initiativeId}/stories/${props.story.id}`,
      {
        method: "PATCH",
        body: {
          expectedRevision: props.story.backlogRevision,
          reason,
          ...changes,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update the story.");
      return false;
    }
    setEditing(false);
    setReason("");
    router.refresh();
    return true;
  }

  if (props.story.archived) {
    return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-950">{props.story.title}</h2>
      <p className="mt-1 text-sm text-amber-900">This story is archived and excluded from active planning.</p>
      <label className="mt-3 block text-xs font-medium text-amber-950">Reason for restoring
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
      </label>
      <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => patch({ archived: false })} className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? "Restoring…" : "Restore story"}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>;
  }

  if (!editing) {
    return <div className="group">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{props.story.title}</h2>
          {props.story.body && <p className="mt-1 text-sm text-neutral-600">{props.story.body}</p>}
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-indigo-700">Edit or reassign</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>;
  }

  return <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
    <label className="block text-xs font-medium text-neutral-700">Story title
      <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
    </label>
    <label className="block text-xs font-medium text-neutral-700">Story outcome
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
    </label>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-xs font-medium text-neutral-700">Story points
        <input type="number" min={1} max={21} value={points ?? ""} onChange={(event) => setPoints(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs font-medium text-neutral-700">Epic and feature
        <select value={epicId} onChange={(event) => setEpicId(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
          {props.epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.label}</option>)}
        </select>
      </label>
    </div>
    <label className="block text-xs font-medium text-neutral-700">Change reason
      <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this story changing?" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
    </label>
    {error && <p className="text-xs text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || title.trim().length < 3 || !body.trim() || reason.trim().length < 3} onClick={() => patch({ title, body, points, epicId })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save story"}</button>
      <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => patch({ archived: true })} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Archive story</button>
      <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-xs font-medium text-neutral-600">Cancel</button>
    </div>
  </section>;
}
