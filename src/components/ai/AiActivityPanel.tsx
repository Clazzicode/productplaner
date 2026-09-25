import GenerationProgress from "@/components/ui/loading/GenerationProgress";

/**
 * The directive's "AI Activity" pattern (§18-21), composed from existing
 * pieces rather than a rewrite: a pre-action explanation in plain language
 * (never internal terms like RAG/embeddings/chunking/inference/vector
 * search) above GenerationProgress's real, non-percentage staged list.
 * `steps`/`currentStep` must each reflect a real completed network call —
 * same rule GenerationProgress already enforces for the deterministic
 * engine's own progress (see its doc comment).
 */
export default function AiActivityPanel(props: { explanation: string; steps: string[]; currentStep: number }) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3 text-sm text-text-secondary">
        {props.explanation}
      </p>
      <GenerationProgress title="Working" steps={props.steps} currentStep={props.currentStep} />
    </div>
  );
}
