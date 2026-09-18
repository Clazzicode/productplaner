"use client";

import { useState } from "react";

export interface AccordionSection {
  id: string;
  title: React.ReactNode;
  /** Badges/status chips shown in the header, right of the title and before the chevron. */
  meta?: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Collapsible section list — the Dashboard's "plan stage" rows expand in
 * place instead of navigating away, so the landing view stays short by
 * default while the detail is one click away.
 */
export default function Accordion(props: { sections: AccordionSection[]; defaultOpenIds?: string[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(props.defaultOpenIds ?? []));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {props.sections.map((section) => {
        const open = openIds.has(section.id);
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-neutral-50"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-800">
                {section.title}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {section.meta}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`h-4 w-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            {open && (
              <div className="border-t border-neutral-100 bg-neutral-50/60 p-4">{section.content}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
