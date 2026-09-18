"use client";

import { useState } from "react";
import type { Explanation } from "@/lib/explainability/types";

/**
 * "How was this calculated?" — a sibling to TraceBadge.tsx, reusing its exact
 * interaction mechanics (pill button, open/close popover), but rendering a
 * weighted-formula breakdown instead of intake-answer provenance. Kept
 * separate from TraceBadge because the two data shapes (provenance vs.
 * weighted breakdown) don't belong in one component's props.
 */
export default function ExplainBadge(props: { explanation: Explanation }) {
  const [open, setOpen] = useState(false);
  const { explanation } = props;

  return (
    <span className="no-print relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
          open
            ? "border-emerald-400 bg-emerald-100 text-emerald-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
        }`}
        title="How was this calculated?"
      >
        ⓘ how calculated
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-40 block w-80 rounded-xl border border-emerald-200 bg-white p-4 text-left shadow-lg">
          <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-600">
            How this was calculated
          </span>
          <span className="mt-1 block text-sm text-neutral-700">{explanation.summary}</span>
          {explanation.terms.length > 0 && (
            <span className="mt-3 block space-y-1.5 border-t border-neutral-100 pt-3">
              {explanation.terms.map((term) => (
                <span key={term.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-neutral-500">{term.label}</span>
                  <span className="font-medium text-neutral-800">
                    {term.value}
                    {term.weight != null && ` × ${term.weight}`}
                    {term.contribution != null && ` = ${term.contribution}`}
                  </span>
                </span>
              ))}
            </span>
          )}
          {explanation.formula && (
            <span className="mt-3 block border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">
              {explanation.formula}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
