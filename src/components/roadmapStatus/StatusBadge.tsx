"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import type { ResolvedStatus, StatusColor, StatusEntityType } from "@/lib/roadmapStatus/types";
import { STATUS_LABELS } from "@/lib/roadmapStatus/types";

// Directive: "never show only a colored dot — always pair the color with a
// label." Reuses the app's existing health-good/health-attention/health-critical
// design tokens for visual consistency with the rest of the product, but this
// is a genuinely separate concept from HealthStatus (src/lib/generation/health.ts)
// — a different table, a different (conditional, not numeric) source of truth,
// and manual-settable. See docs/V2-DESIGN-SYSTEM.md §10 on why those tokens
// are kept distinctly named from emerald/amber/red.
const DOT_CLASS: Record<StatusColor, string> = {
  green: "bg-health-good",
  yellow: "bg-health-attention",
  red: "bg-health-critical",
};
const TEXT_CLASS: Record<StatusColor, string> = {
  green: "text-health-good",
  yellow: "text-health-attention",
  red: "text-health-critical",
};
const COLOR_OPTIONS: StatusColor[] = ["green", "yellow", "red"];

export default function StatusBadge(props: {
  entityType: StatusEntityType;
  entityId: string;
  status: ResolvedStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(props.status);

  const label = status.color ? STATUS_LABELS[status.color] : "Not set";

  const apply = async (color: StatusColor, source: "manual" | "system", reason: string) => {
    setBusy(true);
    const res = await apiFetch(`/api/roadmap-status/${props.entityType}/${props.entityId}`, {
      method: "PATCH",
      body: { color, source, reason },
    });
    setBusy(false);
    if (res.ok) {
      setStatus({ color, source, reason, recommendation: null });
      router.refresh();
    }
  };

  const keepCurrent = () => setStatus({ ...status, recommendation: null });

  return (
    // Card-list usages wrap each row in a <Link> for navigation — this badge
    // (and its popover) must never trigger that when clicked through, so the
    // click is stopped once it's done firing on whatever was actually
    // clicked (bubble phase — capture-phase stopPropagation here would stop
    // the event before it ever reaches the button/popover controls below).
    <span className="no-print relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
        title="Status — click for details"
      >
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${status.color ? DOT_CLASS[status.color] : "bg-neutral-300"}`}
        />
        <span className={status.color ? TEXT_CLASS[status.color] : "text-neutral-500"}>{label}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-40 w-80 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</p>
          <p className="mt-1 text-sm font-medium text-neutral-800">{label}</p>
          {status.reason && <p className="mt-1 text-xs text-neutral-500">{status.reason}</p>}
          {status.source && (
            <p className="mt-1 text-[11px] text-neutral-400">
              {status.source === "manual" ? "Set manually." : "Accepted from a system recommendation."}
            </p>
          )}

          {status.recommendation && (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-xs font-semibold text-indigo-800">
                Status change recommended: {STATUS_LABELS[status.recommendation.color]}
              </p>
              <p className="mt-1 text-xs text-indigo-700">{status.recommendation.reason}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void apply(status.recommendation!.color, "system", status.recommendation!.reason)}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Accept Change
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={keepCurrent}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Keep Current Status
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-neutral-100 pt-3">
            <p className="text-[11px] font-medium text-neutral-500">Set manually</p>
            <div className="mt-1.5 flex gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  onClick={() => void apply(c, "manual", "")}
                  className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${
                    status.color === c ? "border-neutral-400 bg-neutral-100" : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[c]}`} />
                  {STATUS_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
