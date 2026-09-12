"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

const SEQUENCE = [
  "roadmap",
  "feature_hierarchy",
  "epics",
  "stories",
  "acceptance_criteria",
] as const;

const LABELS: Record<string, string> = {
  roadmap: "Roadmap",
  feature_hierarchy: "Features",
  epics: "Epics",
  stories: "Stories",
  acceptance_criteria: "Acceptance Criteria",
};

export interface RefreshLockView {
  layerType: string;
  state: string;
}

type Action = "full" | "respect_locks";

/**
 * The "living plan" recalculate action: two separate, mutually exclusive
 * buttons (never a single ambiguous "Recalculate") — reuses LockBar's
 * confirm-modal idiom.
 *
 * Guided-activation restructure: `manualReleaseCount`/`manualSprintCount` —
 * when non-zero, the confirm copy discloses the impact on the user's
 * manually-confirmed releases/sprints, not just the engine's auto-packed
 * ones. "Full regenerate" (and respect-locks' `full_fallback_no_locks`
 * branch) delete the whole Prototype, manual rows included — that's already
 * disclosed generically below ("You will lose... everything"). The
 * respect-locks disclosure below is specific: `repack_only` never touches
 * manual rows (repackSprints is origin-aware), so nothing needs saying there;
 * `regen_below` can invalidate a manual Sprint's story links, which the app
 * flags afterward as `needs_reconciliation` rather than silently losing them.
 */
export default function RefreshBar(props: {
  initiativeId: string;
  locks: RefreshLockView[];
  manualReleaseCount?: number;
  manualSprintCount?: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasManualData = (props.manualReleaseCount ?? 0) > 0 || (props.manualSprintCount ?? 0) > 0;

  const lockedTypes = SEQUENCE.filter(
    (t) => props.locks.find((l) => l.layerType === t)?.state === "locked",
  );
  const allLocked = lockedTypes.length === SEQUENCE.length;
  const noneLocked = lockedTypes.length === 0;
  const lastLockedLabel = !noneLocked ? LABELS[lockedTypes[lockedTypes.length - 1]] : null;

  const respectLocksCopy = noneLocked
    ? `Nothing is locked yet, so this has the same effect as Full regenerate — it rebuilds the whole plan from your current intake answers${hasManualData ? ", including your manually created releases and sprints" : ""}.`
    : allLocked
      ? "All waterfall layers are locked, so only the auto-packed sprint & release suggestions recompute from your current capacity, budget, and rate — your manually created releases and sprints are never touched."
      : `${lastLockedLabel} and everything above stay exactly as-is. Everything below regenerates from your current intake data.${
          hasManualData
            ? " Your manually created releases stay in place, but a manual sprint whose stories were affected gets flagged for review afterward — nothing is silently dropped."
            : " Sprints and releases are recomputed too."
        } Note: adding, removing, or reclassifying features since your last generation won't be reflected here — use Full regenerate for that.`;

  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${props.initiativeId}/recalculate`, {
      method: "POST",
      body: { mode: action },
    });
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      setError(res.error ?? "Recalculate failed.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="no-print mt-3 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Living plan
      </span>
      <button
        onClick={() => setConfirm("respect_locks")}
        disabled={busy}
        className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
      >
        Recalculate — respect my locks
      </button>
      <button
        onClick={() => setConfirm("full")}
        disabled={busy}
        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
      >
        Full regenerate
      </button>
      {error && <p className="w-full text-xs font-medium text-red-600">{error}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {confirm === "full" ? (
              <>
                <h3 className="text-lg font-semibold">Full regenerate?</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  This rebuilds the entire plan from your current intake answers. You will lose:{" "}
                  <strong>every lock state</strong> (everything unlocks), the{" "}
                  <strong>approved baseline</strong> snapshot, any{" "}
                  <strong>inline edits</strong> you&apos;ve made directly to roadmap/feature/epic/
                  story/acceptance-criteria text, any{" "}
                  <strong>Jira/Integration sync stamps</strong> on individual items, any{" "}
                  <strong>manual phase drags</strong> made on the Timeline view
                  {hasManualData && (
                    <>
                      , and{" "}
                      <strong>
                        {props.manualReleaseCount ?? 0} manually created release
                        {(props.manualReleaseCount ?? 0) === 1 ? "" : "s"} and{" "}
                        {props.manualSprintCount ?? 0} sprint{(props.manualSprintCount ?? 0) === 1 ? "" : "s"}
                      </strong>
                    </>
                  )}
                  . This cannot be undone.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Recalculate, respecting locks?</h3>
                <p className="mt-2 text-sm text-neutral-600">{respectLocksCopy}</p>
              </>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => run(confirm)}
                disabled={busy}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirm === "full"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {busy ? "Working…" : confirm === "full" ? "Full regenerate" : "Recalculate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
