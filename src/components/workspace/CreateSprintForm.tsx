"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonLoader } from "@/components/ui/loading";
import { apiFetch } from "@/lib/clientApi";

export interface AvailableStory {
  id: string;
  title: string;
  points: number;
}

/**
 * Guided-activation restructure: the explicit "Plan Sprint" step (reference
 * doc §8 STATE 5), scoped to one manually-created release. `defaultCapacityPoints`
 * reuses the same capacity math the engine's auto-packer uses
 * (computeEffectiveCapacity) purely as a starting suggestion — the row is
 * only written once the user submits it.
 */
export default function CreateSprintForm(props: {
  releaseId: string;
  releaseName: string;
  availableStories: AvailableStory[];
  defaultCapacityPoints: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacityPoints, setCapacityPoints] = useState(String(Math.round(props.defaultCapacityPoints)));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/releases/${props.releaseId}/sprints`, {
      method: "POST",
      body: {
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date().toISOString(),
        capacityPoints: Number(capacityPoints) || props.defaultCapacityPoints,
        storyIds: selectedIds,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't create the sprint.");
      return;
    }
    setOpen(false);
    setSelectedIds([]);
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
      >
        Plan Sprint
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
      <h4 className="text-sm font-semibold text-indigo-900">Plan a sprint under {props.releaseName}</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-neutral-600">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-neutral-600">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-neutral-600 sm:col-span-2">
          Capacity (points)
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={capacityPoints}
            onChange={(e) => setCapacityPoints(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {props.availableStories.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-neutral-600">Stories to include (optional)</p>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2">
            {props.availableStories.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0 flex-1 truncate" title={s.title}>
                    {s.title}
                  </span>
                  <span className="shrink-0 text-neutral-400">{s.points}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-50"
        >
          Cancel
        </button>
        <ButtonLoader type="submit" loading={busy} loadingLabel="Creating">
          Plan Sprint
        </ButtonLoader>
      </div>
    </form>
  );
}
