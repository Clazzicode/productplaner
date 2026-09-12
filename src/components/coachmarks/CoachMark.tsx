"use client";

import { COACH_MARKS, type CoachMarkKey } from "@/lib/coachMarks/keys";
import { useCoachMarks } from "./CoachMarkProvider";

/**
 * Short, dismissible callout anchored next to whatever it explains (directive
 * §4: "short, dismissible, remembered after completion, accessible again
 * later from Help or Product Tour"). Renders nothing once dismissed, or
 * before the session's dismissed-set has loaded (avoids a flash of every mark
 * at once on first paint) or outside an active tour (see CoachMarkProvider's
 * `active` — auto-on for Experienced users, otherwise only during a replay).
 */
export default function CoachMark(props: { coachMarkKey: CoachMarkKey; className?: string }) {
  const { active, isDismissed, dismiss } = useCoachMarks();
  const copy = COACH_MARKS[props.coachMarkKey];

  if (!active || isDismissed(props.coachMarkKey)) return null;

  return (
    <div
      role="note"
      className={`relative rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 shadow-sm ${props.className ?? ""}`}
    >
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-0.5 leading-snug text-indigo-800">{copy.body}</p>
      <button
        type="button"
        onClick={() => dismiss(props.coachMarkKey)}
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 rounded px-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
      >
        ✕
      </button>
    </div>
  );
}
