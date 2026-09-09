"use client";

export const QUESTIONNAIRE_SECTIONS = [
  "Product Direction",
  "Success",
  "Features",
  "Delivery",
  "Execution Preferences",
  "Review & Generate",
] as const;

/** Top-of-flow progress bar — one segment per section, filled up through the
 * current step. Completed segments double as jump-back navigation. */
export default function SectionProgress(props: { current: number; onJump?: (i: number) => void }) {
  const total = QUESTIONNAIRE_SECTIONS.length;
  const percent = Math.round(((props.current + 1) / total) * 100);
  const label = QUESTIONNAIRE_SECTIONS[props.current];

  return (
    <div className="mb-9">
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium text-text-muted">
          <span className="font-semibold text-text-primary">
            Step {props.current + 1} of {total}
          </span>
          <span className="mx-1.5 text-neutral-300">—</span>
          {label}
        </p>
        <p className="text-xs font-semibold tabular-nums text-accent">{percent}%</p>
      </div>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Intake progress"
      >
        {QUESTIONNAIRE_SECTIONS.map((section, i) => {
          const filled = i <= props.current;
          const clickable = Boolean(props.onJump) && i < props.current;
          return (
            <button
              key={section}
              type="button"
              title={section}
              onClick={() => clickable && props.onJump!(i)}
              disabled={!clickable}
              aria-current={i === props.current ? "step" : undefined}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                filled ? "bg-accent" : "bg-neutral-200"
              } ${clickable ? "cursor-pointer hover:bg-accent-hover" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
