"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

export interface AvailablePhase {
  phaseNumber: number;
  title: string;
}

/**
 * Guided-activation restructure: the explicit "Create Release" step
 * (reference doc §8 STATE 4). Only offers phases that don't already have a
 * manually created release — server re-validates this too.
 */
export default function CreateReleaseForm(props: { initiativeId: string; availablePhases: AvailablePhase[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phaseNumber, setPhaseNumber] = useState(props.availablePhases[0]?.phaseNumber ?? 1);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (props.availablePhases.length === 0) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${props.initiativeId}/releases`, {
      method: "POST",
      body: {
        phaseNumber,
        name: name.trim() || undefined,
        targetDate: targetDate || new Date().toISOString(),
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't create the release.");
      return;
    }
    setOpen(false);
    setName("");
    setTargetDate("");
    router.refresh();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Create Release
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-md rounded-2xl border border-indigo-200 bg-indigo-50 p-4"
    >
      <h3 className="text-sm font-semibold text-indigo-900">Create a release</h3>
      <div className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-neutral-600">
          Phase
          <select
            value={phaseNumber}
            onChange={(e) => setPhaseNumber(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            {props.availablePhases.map((p) => (
              <option key={p.phaseNumber} value={p.phaseNumber}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-neutral-600">
          Release name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Release 1 (MVP)"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-neutral-600">
          Target ship date
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
      </div>
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
          Create Release
        </ButtonLoader>
      </div>
    </form>
  );
}
