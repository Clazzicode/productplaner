import { planningConceptById, type PlanningConceptPart } from "@/lib/planningConcepts/registry";

/** Neutral (never red/amber) flag for a planning-methodology gap the product
 * team hasn't defined yet — an expected, temporary state, not an error.
 * Text is always sourced from the Planning Concept Registry, never a second
 * hardcoded copy of the gap description. */
export default function PendingBusinessRule(props: {
  conceptId: string;
  part: "meaning" | "factors" | "userInputs" | "interpretation" | "output";
  label: string;
  mode?: "inline" | "block";
}) {
  const concept = planningConceptById(props.conceptId);
  const part: PlanningConceptPart | undefined = concept?.[props.part];
  if (!part || part.status !== "needs_business_rule") return null;

  if (props.mode === "block" || props.mode === undefined) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{props.label}</p>
        <p className="mt-1 text-sm text-text-muted">{part.detail}</p>
      </div>
    );
  }

  return (
    <span
      title={part.detail}
      className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-text-muted"
    >
      {props.label}
    </span>
  );
}
