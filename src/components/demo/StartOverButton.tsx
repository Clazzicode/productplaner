"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/clientApi";

// Migrated to the shared Modal primitive (docs/V2-DESIGN-SYSTEM.md). Accepted,
// intentional deltas from the previous hand-rolled dialog: Modal adds an
// X-close button and click-outside-to-dismiss, and its heading is the generic
// style rather than a red-tinted one — the destructive intent still comes
// through via the bold warning copy and the destructive Delete button.
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

      <Modal open={confirming} title="Start over?" onClose={() => setConfirming(false)}>
        <p className="text-sm text-neutral-600">
          This <strong>permanently deletes every initiative</strong> — all intake answers,
          capabilities, generated plans, locks, and integration connections — plus your
          qualifying profile. You&apos;ll land back on Welcome exactly like a brand-new user.{" "}
          <strong>This cannot be undone.</strong>
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Deleting everything…" : "Delete everything & start over"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
