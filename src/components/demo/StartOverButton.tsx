"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

export default function StartOverButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/account/start-over", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not reset.");
      return;
    }
    setConfirming(false);
    router.push("/welcome");
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        title="Delete everything and restart the demo from the beginning"
        className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        Start over
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">Start over?</h3>
            <p className="mt-2 text-sm text-neutral-600">
              This <strong>permanently deletes every initiative</strong> — all intake answers,
              capabilities, generated plans, locks, and integration connections — plus your
              qualifying profile. You&apos;ll land back on Welcome exactly like a brand-new user.{" "}
              <strong>This cannot be undone.</strong>
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Deleting everything…" : "Delete everything & start over"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
