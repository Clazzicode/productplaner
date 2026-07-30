"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

/** Agile-layer control: moving a story between sprints is allowed even while
 * the waterfall layers above are locked (FR-12). */
export default function SprintMoveSelect(props: {
  artifactId: string;
  currentSprintNumber: number;
  sprintNumbers: number[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = async (sprintNumber: number) => {
    if (sprintNumber === props.currentSprintNumber) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/artifacts/${props.artifactId}/move-sprint`, {
      method: "POST",
      body: { sprintNumber },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Move failed.");
      return;
    }
    router.refresh();
  };

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={props.currentSprintNumber}
        disabled={busy}
        onChange={(e) => move(Number(e.target.value))}
        className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] text-neutral-600 focus:border-indigo-500 focus:outline-none"
        title="Move to another sprint"
      >
        {props.sprintNumbers.map((n) => (
          <option key={n} value={n}>
            Sprint {n}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
