"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

/**
 * The "living plan" recalculate action — one button, always a full
 * regenerate from current intake answers.
 *
 * Guided-activation restructure: this used to be two mutually-exclusive
 * buttons ("Recalculate — respect my locks" vs. "Full regenerate"), because
 * the engine had two real regeneration strategies depending on which
 * waterfall layers were locked. The waterfall lock ceremony has been removed
 * platform-wide — nothing can ever lock a layer again — so
 * `determineRespectLocksBranch` (src/lib/generation/engine.ts) always
 * resolves to its "nothing is locked" branch now, which is already
 * byte-for-byte the same regeneration `mode: "full"` performs. Two buttons
 * that always do the same thing is worse than one honest one, so this
 * collapses to a single "Regenerate" action instead of quietly leaving a
 * dead choice in the UI. `manualReleaseCount`/`manualSprintCount` still
 * matter here: they only change what the confirm copy discloses, not which
 * mode is sent.
 */
export default function RefreshBar(props: {
  initiativeId: string;
  manualReleaseCount?: number;
  manualSprintCount?: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasManualData = (props.manualReleaseCount ?? 0) > 0 || (props.manualSprintCount ?? 0) > 0;

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${props.initiativeId}/recalculate`, {
      method: "POST",
      body: { mode: "full" },
    });
    setBusy(false);
    setConfirm(false);
    if (!res.ok) {
      setError(res.error ?? "Regenerate failed.");
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
        onClick={() => setConfirm(true)}
        disabled={busy}
        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
      >
        Regenerate
      </button>
      {error && <p className="w-full text-xs font-medium text-red-600">{error}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Regenerate the plan?</h3>
            <p className="mt-2 text-sm text-neutral-600">
              This rebuilds the entire plan from your current intake answers. You will lose any{" "}
              <strong>inline edits</strong> you&apos;ve made directly to roadmap/feature/epic/
              story/acceptance-criteria text, any <strong>Jira/Integration sync stamps</strong> on
              individual items, any <strong>manual phase drags</strong> made on the Timeline view
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
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <ButtonLoader
                onClick={run}
                loading={busy}
                loadingLabel="Regenerating"
                className="!bg-amber-600 hover:!bg-amber-700 disabled:hover:!bg-amber-600"
              >
                Regenerate
              </ButtonLoader>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
