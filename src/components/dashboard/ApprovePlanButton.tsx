"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { ButtonLoader } from "@/components/ui/loading";

/** Versioning foundation (directive §17/§25) — the lightweight replacement
 * for the disabled FR-11/12/13 lock ceremony: approving snapshots the
 * current plan as the baseline and makes future full/partial regenerates
 * require explicit confirmation instead of silently rebuilding it. */
export default function ApprovePlanButton(props: { initiativeId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${props.initiativeId}/approve-plan`, { method: "POST" });
    setBusy(false);
    setConfirm(false);
    if (!res.ok) {
      setError(res.error ?? "Could not approve the plan.");
      return;
    }
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
      >
        Approve plan
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Approve this plan?</h3>
            <p className="mt-2 text-sm text-neutral-600">
              This snapshots the current roadmap, features, epics, stories, and acceptance criteria
              as the approved baseline. After this, regenerating the plan will ask for confirmation
              instead of silently rebuilding it.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <ButtonLoader onClick={approve} loading={busy} loadingLabel="Approving">
                Approve
              </ButtonLoader>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
