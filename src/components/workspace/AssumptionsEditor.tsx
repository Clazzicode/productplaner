"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export interface AssumptionValues {
  averageHourlyRate: number;
  budget: number | null;
  utilizationRatePercent: number;
  capacityBufferPercent: number;
  hoursPerStoryPoint: number;
  hoursPerSprintPerMember: number;
  historicalVelocityPoints: number | null;
}

/**
 * §31 prototype assumptions stay editable after generation. Saving recomputes
 * the flexible agile layers (sprints/releases) — locked waterfall layers are
 * never touched (§29 / FR-18).
 */
export default function AssumptionsEditor(props: {
  initiativeId: string;
  values: AssumptionValues;
}) {
  const router = useRouter();
  const [form, setForm] = useState<AssumptionValues>(props.values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await apiFetch<{ sprintsRepacked: number | null }>(
      `/api/initiatives/${props.initiativeId}/assumptions`,
      { method: "PATCH", body: form },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the assumptions.");
      return;
    }
    setSaved(true);
    router.refresh(); // every cost/capacity figure recomputes from the new inputs
  };

  const num = (v: string): number | null => (v === "" ? null : Number(v));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-800">Cost &amp; capacity assumptions</h3>
      <p className="mt-0.5 text-xs text-neutral-400">
        Configurable prototype assumptions (§31) — editing them recalculates sprints, capacity and
        every cost figure. Locked planning layers are never changed.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Avg. hourly rate ($)"
          value={form.averageHourlyRate}
          onChange={(v) => setForm({ ...form, averageHourlyRate: v ?? 85 })}
        />
        <Field
          label="Budget ($, optional)"
          value={form.budget ?? ""}
          onChange={(v) => setForm({ ...form, budget: v })}
        />
        <Field
          label="Utilization (%)"
          value={form.utilizationRatePercent}
          onChange={(v) => setForm({ ...form, utilizationRatePercent: v ?? 70 })}
        />
        <Field
          label="Capacity buffer (%)"
          value={form.capacityBufferPercent}
          onChange={(v) => setForm({ ...form, capacityBufferPercent: v ?? 15 })}
        />
        <Field
          label="Hours per story point"
          value={form.hoursPerStoryPoint}
          onChange={(v) => setForm({ ...form, hoursPerStoryPoint: v ?? 8 })}
        />
        <Field
          label="Hours / member / sprint"
          value={form.hoursPerSprintPerMember}
          onChange={(v) => setForm({ ...form, hoursPerSprintPerMember: v ?? 80 })}
        />
        <Field
          label="Historical velocity (pts, optional)"
          value={form.historicalVelocityPoints ?? ""}
          onChange={(v) => setForm({ ...form, historicalVelocityPoints: v })}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && !error && (
        <p className="mt-3 text-sm text-emerald-700">
          Saved — sprint plan and cost figures recalculated.
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Recalculating…" : "Save & recalculate"}
        </button>
      </div>
    </div>
  );

  function Field(p: {
    label: string;
    value: number | "";
    onChange: (v: number | null) => void;
  }) {
    return (
      <label className="block text-xs font-medium text-neutral-600">
        {p.label}
        <input
          type="number"
          value={p.value}
          onChange={(e) => p.onChange(num(e.target.value))}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
    );
  }
}
