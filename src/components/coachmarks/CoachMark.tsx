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
 *
 * Directive item 6: when this key is the tour's current step, renders the
 * guided Next/Back/Skip/End-Tour controls instead of the plain ✕ — every
 * other mark on the page (or an ad hoc encounter with no tour running) keeps
 * today's single-dismiss behavior unchanged.
 */
export default function CoachMark(props: { coachMarkKey: CoachMarkKey; className?: string }) {
  const { active, isDismissed, dismiss, tour, isActiveTourStep, tourNext, tourBack, tourSkip, endTour } =
    useCoachMarks();
  const copy = COACH_MARKS[props.coachMarkKey];
  const isTourStep = isActiveTourStep(props.coachMarkKey);

  if (!active) return null;
  if (!isTourStep && isDismissed(props.coachMarkKey)) return null;

  return (
    <div
      role="note"
      className={`relative rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 shadow-sm ${props.className ?? ""}`}
    >
      {isTourStep && tour && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-indigo-500">
          Step {tour.index + 1} of {tour.steps.length}
        </p>
      )}
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-0.5 leading-snug text-indigo-800">{copy.body}</p>

      {isTourStep && tour ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
          {tour.index > 0 && (
            <button type="button" onClick={tourBack} className="text-indigo-700 hover:underline">
              Back
            </button>
          )}
          <button type="button" onClick={tourSkip} className="text-indigo-500 hover:underline">
            Skip
          </button>
          <button type="button" onClick={tourNext} className="text-indigo-700 hover:underline">
            {tour.index === tour.steps.length - 1 ? "Done" : "Next"}
          </button>
          <button type="button" onClick={endTour} className="ml-auto text-indigo-400 hover:underline">
            End Tour
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => dismiss(props.coachMarkKey)}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded px-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
        >
          ✕
        </button>
      )}
    </div>
  );
}
