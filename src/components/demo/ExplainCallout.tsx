"use client";

import { useDemoMode } from "./DemoModeContext";

/**
 * Demo Explanation Mode callout — renders nothing when the mode is off, so
 * the normal product experience is untouched. Drop one next to any section
 * that deserves an explanation during a demo.
 */
export default function ExplainCallout(props: { children: React.ReactNode; className?: string }) {
  const { enabled } = useDemoMode();
  if (!enabled) return null;
  return (
    <div
      className={`no-print mt-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-2 text-xs leading-relaxed text-indigo-800 ${props.className ?? ""}`}
    >
      <span className="mr-1.5 font-semibold uppercase tracking-wide text-indigo-500">Why:</span>
      {props.children}
    </div>
  );
}
