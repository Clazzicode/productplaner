/**
 * Directive §21's completion synopsis: what was created, what's unresolved,
 * and what was assumed along the way — shown once an AI action finishes,
 * instead of dropping the user straight into a raw result with no framing.
 * Any section with nothing to say is omitted rather than rendered empty.
 */
export default function AiCompletionSynopsis(props: {
  sourceLabel: string;
  created: string[];
  unresolved?: string[];
  assumptions?: string[];
}) {
  const unresolved = props.unresolved ?? [];
  const assumptions = props.assumptions ?? [];

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm">
      <p className="font-medium text-emerald-900">From {props.sourceLabel}:</p>
      {props.created.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-emerald-800">
          {props.created.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {assumptions.length > 0 && (
        <div className="mt-2.5 border-t border-emerald-200/70 pt-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Assumptions</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-800">
            {assumptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {unresolved.length > 0 && (
        <div className="mt-2.5 border-t border-emerald-200/70 pt-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs your review</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
            {unresolved.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
