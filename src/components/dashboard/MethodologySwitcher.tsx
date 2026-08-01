"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

const OPTIONS: { value: string; label: string; blurb: string }[] = [
  { value: "hybrid", label: "Hybrid Waterfall", blurb: "Strict sequential locking, MVP-gated roadmap, discrete sprints." },
  { value: "agile_scrum", label: "Agile / Scrum", blurb: "Any lock order, continuous prioritized backlog, discrete sprints." },
  { value: "waterfall", label: "Waterfall", blurb: "Strict sequential locking, MVP-gated roadmap; sprints freeze once the baseline is approved." },
  { value: "kanban", label: "Kanban", blurb: "Strict sequential locking, MVP-gated roadmap, continuous flow — no sprints, throughput-based forecasts." },
];

/**
 * Methodology is user-changeable at any time. Switching always fully
 * regenerates the plan under the new profile's rules — there's no safe
 * partial merge between fundamentally different roadmap/lock/sprint shapes.
 */
export default function MethodologySwitcher(props: { initiativeId: string; current: string }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState(props.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLabel = OPTIONS.find((o) => o.value === props.current)?.label ?? props.current;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/initiatives/${props.initiativeId}/methodology`, {
      method: "POST",
      body: { methodology: choice },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not switch methodology.");
      return;
    }
    setPicking(false);
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => {
          setChoice(props.current);
          setPicking(true);
        }}
        className="font-medium text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900"
        title="Change methodology"
      >
        {currentLabel}
      </button>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Change methodology</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Switching <strong>fully regenerates the plan</strong> from your current intake
              answers under the new methodology&apos;s rules — every lock state, the approved
              baseline, and any inline edits are replaced. This cannot be undone.
            </p>
            <div className="mt-4 space-y-2">
              {OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    choice === o.value ? "border-indigo-400 bg-indigo-50" : "border-neutral-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="methodology"
                    className="mt-1"
                    checked={choice === o.value}
                    onChange={() => setChoice(o.value)}
                  />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-xs text-neutral-500">{o.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setPicking(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={busy || choice === props.current}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "Regenerating…" : "Switch & regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
