"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/clientApi";
import type { WeightSetConfigView } from "@/lib/planningWeights/planningWeights";

const SUM_TOLERANCE = 0.001;

function sumOf(weights: Record<string, number>): number {
  return Object.values(weights).reduce((s, v) => s + v, 0);
}

/**
 * Editable, transparent scoring weights — the "greater weight control" part
 * of Advanced Settings for experienced users (see
 * src/lib/planningWeights/permissions.ts for who can reach this at all; the
 * caller only renders this component when canEditPlanningWeights() is true).
 * Each weight SET is saved/reset independently (mirrors AssumptionsEditor.tsx's
 * always-editable inline form, not DashboardConfigEditor's per-widget toggle
 * shape, since these are numbers that must sum to 1.0, not booleans).
 */
export default function PlanningWeightsEditor(props: { initiativeId: string; sets: WeightSetConfigView[] }) {
  const router = useRouter();
  const [sets, setSets] = useState(props.sets);
  const [busySetId, setBusySetId] = useState<string | null>(null);
  const [errorBySetId, setErrorBySetId] = useState<Record<string, string>>({});
  const [savedMessageBySetId, setSavedMessageBySetId] = useState<Record<string, string>>({});

  const setWeight = (setId: string, key: string, value: number) => {
    setSets((prev) =>
      prev.map((s) => (s.id === setId ? { ...s, weights: { ...s.weights, [key]: value } } : s)),
    );
    setSavedMessageBySetId((prev) => ({ ...prev, [setId]: "" }));
  };

  const save = async (setId: string) => {
    const set = sets.find((s) => s.id === setId);
    if (!set) return;
    setBusySetId(setId);
    setErrorBySetId((prev) => ({ ...prev, [setId]: "" }));
    const res = await apiFetch<{ weights: Record<string, number> }>(
      `/api/initiatives/${props.initiativeId}/planning-weights/${setId}`,
      { method: "PATCH", body: { weights: set.weights } },
    );
    setBusySetId(null);
    if (!res.ok || !res.data) {
      setErrorBySetId((prev) => ({ ...prev, [setId]: res.error ?? "Could not save these weights." }));
      return;
    }
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, weights: res.data!.weights, isOverridden: true } : s)));
    setSavedMessageBySetId((prev) => ({ ...prev, [setId]: "Saved — scores now reflect these weights." }));
    router.refresh();
  };

  const reset = async (setId: string) => {
    setBusySetId(setId);
    setErrorBySetId((prev) => ({ ...prev, [setId]: "" }));
    const res = await apiFetch<{ weights: Record<string, number> }>(
      `/api/initiatives/${props.initiativeId}/planning-weights/${setId}`,
      { method: "DELETE" },
    );
    setBusySetId(null);
    if (!res.ok || !res.data) {
      setErrorBySetId((prev) => ({ ...prev, [setId]: res.error ?? "Could not reset these weights." }));
      return;
    }
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, weights: res.data!.weights, isOverridden: false } : s)));
    setSavedMessageBySetId((prev) => ({ ...prev, [setId]: "Reset to default weights." }));
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Scoring weights</h3>
        <p className="mt-1 text-xs text-neutral-500">
          These are the exact weights the plan is scored with — editing them changes real scores, not a preview.
        </p>
      </div>

      {sets.map((set) => {
        const sum = sumOf(set.weights);
        const validSum = Math.abs(sum - 1) <= SUM_TOLERANCE;
        const dirty = Object.keys(set.weights).some((k) => set.weights[k] !== props.sets.find((s) => s.id === set.id)?.weights[k]);
        const busy = busySetId === set.id;

        return (
          <div key={set.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-neutral-800">{set.title}</p>
              {!set.isOverridden && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Default
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-neutral-400">{set.description}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {set.factors.map((factor) => (
                <label key={factor.key} className="block text-xs font-medium text-neutral-600" title={factor.description}>
                  {factor.label}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={set.weights[factor.key] ?? 0}
                    onChange={(e) => setWeight(set.id, factor.key, Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>

            <p className={`mt-3 text-xs font-medium ${validSum ? "text-neutral-500" : "text-red-600"}`}>
              Sum: {sum.toFixed(3)} {validSum ? "" : "— weights must sum to 1.0"}
            </p>

            {errorBySetId[set.id] && <p className="mt-2 text-sm text-red-600">{errorBySetId[set.id]}</p>}
            {savedMessageBySetId[set.id] && !dirty && (
              <p className="mt-2 text-sm text-emerald-700">{savedMessageBySetId[set.id]}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => reset(set.id)} disabled={busy || !set.isOverridden}>
                Reset to default
              </Button>
              <Button onClick={() => save(set.id)} disabled={busy || !dirty || !validSum}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
