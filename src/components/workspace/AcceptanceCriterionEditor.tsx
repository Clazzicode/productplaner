"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

type HistoryItem = {
  id: string;
  version: number;
  title: string;
  body: string;
  reason: string;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
};

export default function AcceptanceCriterionEditor(props: {
  initiativeId: string;
  criterion: {
    id: string;
    title: string;
    body: string;
    backlogRevision: number;
    approved: boolean;
    archived: boolean;
  };
  adequacyGaps: string[];
  history: HistoryItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.criterion.title);
  const [body, setBody] = useState(props.criterion.body);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(changes: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const result = await apiFetch(
      `/api/initiatives/${props.initiativeId}/criteria/${props.criterion.id}`,
      {
        method: "PATCH",
        body: {
          expectedRevision: props.criterion.backlogRevision,
          reason,
          ...changes,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update the acceptance criterion.");
      return;
    }
    setEditing(false);
    setReason("");
    router.refresh();
  }

  async function approve() {
    setBusy(true);
    setError("");
    const result = await apiFetch(
      `/api/initiatives/${props.initiativeId}/criteria/${props.criterion.id}/approve`,
      {
        method: "POST",
        body: {
          expectedRevision: props.criterion.backlogRevision,
          comment: reason,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not approve the acceptance criterion.");
      return;
    }
    setReason("");
    router.refresh();
  }

  if (props.criterion.archived) {
    return (
      <section className="rounded-lg bg-amber-50 p-3">
        <h4 className="text-sm font-semibold text-amber-950">{props.criterion.title}</h4>
        <p className="mt-1 text-sm text-amber-900">{props.criterion.body}</p>
        <label className="mt-3 block text-xs font-medium text-amber-950">
          Reason for restoring
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => patch({ archived: false })} className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          Restore criterion
        </button>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </section>
    );
  }

  return (
    <section>
      {editing ? (
        <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
          <label className="block text-xs font-medium text-neutral-700">
            Criterion title
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-neutral-700">
            Testable outcome
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
          </label>
          {props.criterion.approved && (
            <p className="text-xs text-amber-800">
              Saving a changed approved criterion reopens it for review while preserving the approved version.
            </p>
          )}
          <label className="block text-xs font-medium text-neutral-700">
            Change reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this criterion changing?" className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || title.trim().length < 3 || body.trim().length < 3 || reason.trim().length < 3} onClick={() => patch({ title, body })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              Save criterion
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-xs text-neutral-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">{props.criterion.title}</h4>
            <p className="mt-1 text-sm text-neutral-600">{props.criterion.body}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-indigo-700">Edit</button>
        </div>
      )}

      {props.adequacyGaps.length > 0 && (
        <ul className="mt-3 list-disc rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-900">
          {props.adequacyGaps.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      )}

      {!editing && (
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="text-xs font-medium text-neutral-600">
            {props.criterion.approved ? "Reason for reopening or archiving" : "Approval or archive reason"}
            <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          {props.criterion.approved ? (
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => patch({ reopen: true })} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">
              Reopen
            </button>
          ) : (
            <button type="button" disabled={busy || reason.trim().length < 3 || props.adequacyGaps.length > 0} onClick={approve} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              Approve
            </button>
          )}
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => patch({ archived: true })} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">
            Archive
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {props.history.length > 0 && (
        <details className="mt-4 rounded-lg border border-neutral-200 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-neutral-700">
            Version history and comparison ({props.history.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="font-semibold text-emerald-900">Current version</p>
              <p className="mt-1 font-medium">{props.criterion.title}</p>
              <p className="mt-1 text-neutral-600">{props.criterion.body}</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3">
              <p className="font-semibold text-neutral-700">Previous saved version</p>
              <p className="mt-1 font-medium">{props.history[0].title}</p>
              <p className="mt-1 text-neutral-600">{props.history[0].body}</p>
              <p className="mt-2 text-neutral-500">{props.history[0].reason}</p>
            </div>
          </div>
          <ol className="mt-3 space-y-2">
            {props.history.map((revision) => (
              <li key={revision.id} className="border-l-2 border-indigo-200 pl-3">
                Version {revision.version} · {revision.reason} · {new Date(revision.createdAt).toLocaleString()} · {revision.actor?.name ?? revision.actor?.email ?? "System"}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
