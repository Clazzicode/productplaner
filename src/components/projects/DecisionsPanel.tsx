"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

export interface DecisionView {
  id: string;
  title: string;
  description: string;
  decidedAt: string | null;
}

/** Project Home's "Previous decisions" section (directive §7) — structured
 * and persisted, not a freeform notes field (directive §24: crystallize
 * approved information). */
export default function DecisionsPanel(props: { projectId: string; decisions: DecisionView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/projects/${props.projectId}/decisions`, {
      method: "POST",
      body: { title, description },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not record the decision.");
      return;
    }
    setTitle("");
    setDescription("");
    setAdding(false);
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Previous decisions</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            + Add decision
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What was decided?"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Context (optional)"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <ButtonLoader onClick={submit} loading={busy} loadingLabel="Saving" disabled={title.trim().length < 3}>
              Save
            </ButtonLoader>
          </div>
        </div>
      )}

      {props.decisions.length === 0 && !adding ? (
        <p className="mt-2 text-xs text-neutral-400">No decisions recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {props.decisions.map((d) => (
            <li key={d.id} className="rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-sm font-medium text-neutral-800">{d.title}</p>
              {d.description && <p className="mt-0.5 text-xs text-neutral-500">{d.description}</p>}
              {d.decidedAt && (
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {new Date(d.decidedAt).toLocaleDateString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
