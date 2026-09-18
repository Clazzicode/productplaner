"use client";

/** Large, card-style multiple-choice option — the primary "bubble" pattern
 * used for one-question-at-a-time picks (product type, experience level,
 * methodology, execution tool, MVP yes/no). */
export function ChoiceCard(props: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.selected}
      className={`group relative w-full rounded-2xl border-2 p-4 text-left transition ${
        props.selected
          ? "border-accent bg-accent/[0.06] shadow-sm"
          : "border-neutral-200 bg-white hover:border-accent/40 hover:bg-accent/[0.03]"
      } ${props.className ?? ""}`}
    >
      <span className={`block text-sm font-semibold ${props.selected ? "text-accent-hover" : "text-text-primary"}`}>
        {props.label}
      </span>
      {props.hint && <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{props.hint}</span>}
      {props.selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Compact pill-style multiple-choice option — for dense, in-line scales
 * (effort, value, risk) where a full card grid would be too heavy. */
export function ChoicePill(props: {
  selected: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.selected}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
        props.selected
          ? "border-accent bg-accent text-white"
          : "border-neutral-300 bg-white text-text-secondary hover:border-accent/50 hover:text-text-primary"
      } ${props.className ?? ""}`}
    >
      {props.label}
    </button>
  );
}
