"use client";

export const QUESTIONNAIRE_SECTIONS = [
  "Product Direction",
  "Success",
  "Capabilities",
  "Delivery",
  "Execution Preferences",
  "Review & Generate",
] as const;

export default function SectionProgress(props: { current: number; onJump?: (i: number) => void }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-1 text-xs">
      {QUESTIONNAIRE_SECTIONS.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => props.onJump && i < props.current && props.onJump(i)}
            disabled={!props.onJump || i >= props.current}
            className={`rounded-full px-3 py-1 font-medium ${
              i === props.current
                ? "bg-indigo-600 text-white"
                : i < props.current
                  ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {i + 1}. {label}
          </button>
          {i < QUESTIONNAIRE_SECTIONS.length - 1 && <span className="text-neutral-300">→</span>}
        </li>
      ))}
    </ol>
  );
}
