import LoadingDots from "./LoadingDots";

/**
 * Guided-activation restructure (reference doc §16 "Plan Generation
 * Loading"): a multi-step progress list for longer operations (plan
 * generation) — e.g. "Analyzing your answers / Organizing features /
 * Creating roadmap structure / Preparing delivery plan".
 *
 * `currentStep` is driven by the CALLER's own real await sequence (e.g.
 * SimplifiedIntakeWizard sets it right before each real API call it's about
 * to make), not a blind timer — every step shown as "done" really
 * completed, and the active step's dots reflect a real in-flight request,
 * never a fake percentage (reference doc explicitly bans those, not step
 * lists).
 */
export default function GenerationProgress(props: { title: string; steps: string[]; currentStep: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <p className="text-sm font-semibold text-text-primary">{props.title}</p>
      <ul className="mt-4 space-y-2.5">
        {props.steps.map((step, i) => (
          <li key={step} className="flex items-center gap-2.5 text-sm">
            {i < props.currentStep ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                ✓
              </span>
            ) : i === props.currentStep ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-accent">
                <LoadingDots />
              </span>
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-300" />
            )}
            <span className={i <= props.currentStep ? "text-text-primary" : "text-text-muted"}>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
