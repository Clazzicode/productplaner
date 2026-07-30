"use client";

import { useState } from "react";

export interface TraceEntryView {
  key: string;
  label: string;
  answer: string;
}

/** FR-10: traceability visible at all times — every artifact opens its chain
 * back to the intake answers that produced it. */
export default function TraceBadge(props: { note: string; entries: TraceEntryView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="no-print relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
          open
            ? "border-indigo-400 bg-indigo-100 text-indigo-800"
            : "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
        }`}
        title="Why does this artifact exist?"
      >
        ⛓ trace{props.entries.length > 0 ? `: ${props.entries.map((e) => e.key).join(",")}` : ""}
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-40 block w-80 rounded-xl border border-indigo-200 bg-white p-4 text-left shadow-lg">
          <span className="block text-xs font-semibold uppercase tracking-wide text-indigo-500">
            Traceability
          </span>
          <span className="mt-1 block text-sm text-neutral-700">{props.note}</span>
          {props.entries.length > 0 && (
            <span className="mt-3 block space-y-2 border-t border-neutral-100 pt-3">
              {props.entries.map((e) => (
                <span key={e.key} className="block">
                  <span className="block text-xs font-medium text-neutral-500">{e.label}</span>
                  <span className="block text-sm text-neutral-800">{e.answer || "—"}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
