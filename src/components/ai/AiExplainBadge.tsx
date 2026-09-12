"use client";

import { useState } from "react";

/**
 * "Why did AI do this?" — the AI-specific sibling of TraceBadge (intake-answer
 * provenance) and ExplainBadge (weighted-formula breakdown), reusing their
 * exact pill/popover mechanics for a third, AI-shaped data type: Information
 * Used / Why / Assumptions / Sources / Rules Applied. `sources` is
 * document-level only (e.g. a filename) — the current extraction flattens a
 * document to plain text with no page/slide boundaries preserved, so a
 * page/slide-level reference would be fabricated, not real; that's a future
 * increment gated on page-aware extraction, not a schema field that would
 * always read null today.
 */
export default function AiExplainBadge(props: {
  informationUsed: string;
  why: string;
  assumptions?: string[];
  sources: string[];
  rulesApplied?: string[];
}) {
  const [open, setOpen] = useState(false);
  const assumptions = props.assumptions ?? [];
  const rulesApplied = props.rulesApplied ?? [];

  return (
    <span className="no-print relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
          open
            ? "border-violet-400 bg-violet-100 text-violet-800"
            : "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100"
        }`}
        title="Why did AI do this?"
      >
        ✨ why AI did this
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-40 block w-80 rounded-xl border border-violet-200 bg-white p-4 text-left shadow-lg">
          <span className="block text-xs font-semibold uppercase tracking-wide text-violet-600">
            Information used
          </span>
          <span className="mt-1 block text-sm text-neutral-700">{props.informationUsed}</span>

          <span className="mt-3 block border-t border-neutral-100 pt-3 text-xs font-semibold uppercase tracking-wide text-violet-600">
            Why
          </span>
          <span className="mt-1 block text-sm text-neutral-700">{props.why}</span>

          {assumptions.length > 0 && (
            <span className="mt-3 block border-t border-neutral-100 pt-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-violet-600">
                Assumptions
              </span>
              <span className="mt-1 block space-y-1 text-sm text-neutral-700">
                {assumptions.map((a) => (
                  <span key={a} className="block">
                    • {a}
                  </span>
                ))}
              </span>
            </span>
          )}

          <span className="mt-3 block border-t border-neutral-100 pt-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-violet-600">Sources</span>
            <span className="mt-1 block text-sm text-neutral-700">{props.sources.join(", ")}</span>
          </span>

          {rulesApplied.length > 0 && (
            <span className="mt-3 block border-t border-neutral-100 pt-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-violet-600">
                Rules applied
              </span>
              <span className="mt-1 block space-y-1 text-sm text-neutral-700">
                {rulesApplied.map((r) => (
                  <span key={r} className="block">
                    • {r}
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
