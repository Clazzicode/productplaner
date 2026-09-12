"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

/** Inline title/body(/points) editor. */
export default function EditableArtifact(props: {
  artifactId: string;
  title: string;
  body: string;
  points?: number | null;
  titleClassName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.title);
  const [body, setBody] = useState(props.body);
  const [points, setPoints] = useState<number | null>(props.points ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { title, body };
    if (props.points !== undefined && points !== null) payload.points = points;
    const res = await apiFetch(`/api/artifacts/${props.artifactId}`, {
      method: "PATCH",
      body: payload,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      return;
    }
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-indigo-300 bg-indigo-50/40 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium focus:border-indigo-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {props.points !== undefined && (
          <label className="mt-2 block text-xs font-medium text-neutral-600">
            Story points
            <input
              type="number"
              min={1}
              max={21}
              value={points ?? ""}
              onChange={(e) => setPoints(e.target.value === "" ? null : Number(e.target.value))}
              className="ml-2 w-20 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false);
              setTitle(props.title);
              setBody(props.body);
              setError(null);
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
          <ButtonLoader onClick={save} loading={busy} loadingLabel="Saving" disabled={title.trim().length < 3}>
            Save
          </ButtonLoader>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-start justify-between gap-2">
        <h3 className={props.titleClassName ?? "font-semibold"}>{props.title}</h3>
        <button
          onClick={() => setEditing(true)}
          className="no-print shrink-0 text-xs font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 hover:underline"
        >
          Edit
        </button>
      </div>
      {props.body && <p className="mt-1 text-sm text-neutral-600">{props.body}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
