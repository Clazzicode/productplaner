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

export interface LockView {
  layerType: string;
  state: string;
  everLocked: boolean;
}

export interface LayerCounts {
  features: number;
  epics: number;
  stories: number;
  acs: number;
}

function downstreamSummary(layerType: string, counts: LayerCounts): string {
  const parts: string[] = [];
  const idx = SEQUENCE.indexOf(layerType as (typeof SEQUENCE)[number]);
  if (idx <= 0) parts.push(`${counts.features} features`);
  if (idx <= 1) parts.push(`${counts.epics} epics`);
  if (idx <= 2) parts.push(`${counts.stories} stories`);
  if (idx <= 3) parts.push(`${counts.acs} acceptance criteria`);
  return parts.join(", ");
}

export default function LockBar(props: {
  initiativeId: string;
  locks: LockView[];
  counts: LayerCounts;
  /** Agile/Scrum relaxes the strict lock sequence — the client-side
   * pre-check is skipped so it doesn't false-positive-block an order the
   * server would actually allow. */
  methodology?: string;
}) {
  const unordered = props.methodology === "agile_scrum";
  const router = useRouter();
  const [confirm, setConfirm] = useState<{ layerType: string; mode: "lock" | "unlock" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockFor = (t: string) => props.locks.find((l) => l.layerType === t);

  const act = async (layerType: string, mode: "lock" | "unlock") => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(
      `/api/initiatives/${props.initiativeId}/layers/${layerType}/${mode}`,
      { method: "POST", body: {} },
    );
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      setError(res.error ?? "Action failed.");
      return;
    }
    router.refresh();
  };

  const onChipClick = (layerType: string) => {
    setError(null);
    const lock = lockFor(layerType);
    if (!lock) return;
    if (lock.state === "locked") {
      setConfirm({ layerType, mode: "unlock" });
      return;
    }
    // FR-12 client-side pre-check (server enforces it authoritatively) —
    // skipped for Agile/Scrum, which allows any lock order.
    const idx = SEQUENCE.indexOf(layerType as (typeof SEQUENCE)[number]);
    if (!unordered && idx > 0 && lockFor(SEQUENCE[idx - 1])?.state !== "locked") {
      setError(
        `Lock ${LABELS[SEQUENCE[idx - 1]]} first — waterfall layers lock in strict sequence.`,
      );
      return;
    }
    setConfirm({ layerType, mode: "lock" });
  };

  const confirmLock = confirm ? lockFor(confirm.layerType) : null;
  const regenWarning =
    confirm?.mode === "lock" && confirmLock?.everLocked
      ? downstreamSummary(confirm.layerType, props.counts)
      : null;

  return (
    <div className="no-print">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Waterfall locks
        </span>
        {SEQUENCE.map((t, i) => {
          const lock = lockFor(t);
          const locked = lock?.state === "locked";
          return (
            <span key={t} className="flex items-center gap-1.5">
              <button
                onClick={() => onChipClick(t)}
                disabled={busy}
                title={locked ? "Locked — click to unlock" : "Unlocked — click to lock"}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  locked
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "border-neutral-300 bg-white text-neutral-600 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              >
                {locked ? "🔒" : "🔓"} {LABELS[t]}
              </button>
              {i < SEQUENCE.length - 1 && <span className="text-neutral-300">→</span>}
            </span>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {confirm.mode === "unlock" ? (
              <>
                <h3 className="text-lg font-semibold">Unlock {LABELS[confirm.layerType]}?</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Unlocking also unlocks every layer beneath it — an upper layer can&apos;t be
                  open for editing while lower layers claim to be final. You&apos;ll re-lock
                  them in order when you&apos;re done, and re-locking re-propagates your edits
                  downstream.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">Lock {LABELS[confirm.layerType]}?</h3>
                {regenWarning ? (
                  <p className="mt-2 text-sm text-neutral-600">
                    This layer has been locked before, so re-locking{" "}
                    <strong>regenerates everything beneath it</strong> ({regenWarning}) and
                    recomputes the sprint plan, release plan and capacity forecast. Manual edits
                    to those lower layers will be replaced.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-neutral-600">
                    Locking freezes this layer so the next one can be reviewed against it.
                    {confirm.layerType === "acceptance_criteria" &&
                      " Locking the final layer also stores the approved plan baseline — the reference every future health comparison is made against."}
                  </p>
                )}
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
                onClick={() => act(confirm.layerType, confirm.mode)}
                disabled={busy}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirm.mode === "lock" && regenWarning
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {busy
                  ? "Working…"
                  : confirm.mode === "lock"
                    ? regenWarning
                      ? "Lock & re-propagate"
                      : "Lock layer"
                    : "Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
