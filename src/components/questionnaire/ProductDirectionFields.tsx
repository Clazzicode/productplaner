import { FIELD_CLASS } from "./fieldStyles";

export interface ProductDirectionValues {
  name: string;
  problemStatement: string;
  targetCustomer: string;
}

/** Shared field set — used both at initiative creation (`/initiatives/new`) and when
 * editing Product Direction later from within the main questionnaire/Review. */
export default function ProductDirectionFields(props: {
  values: ProductDirectionValues;
  onChange: (patch: Partial<ProductDirectionValues>) => void;
  verbose: boolean;
}) {
  const { values, onChange, verbose } = props;
  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-text-primary">
        Initiative name
        <input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Customer Self-Service Portal"
          className={`mt-1.5 w-full ${FIELD_CLASS}`}
          autoFocus
        />
      </label>

      <label className="block text-sm font-medium text-text-primary">
        What problem are you solving?
        <p className="mt-1 mb-1.5 text-xs text-text-muted">
          {verbose
            ? "Describe the pain in the customer's world — not your solution. This answer anchors the whole plan: it frames the roadmap, feeds every epic description, and opens the executive narrative. Example: “Support agents juggle five disconnected tools to answer one billing question, so responses take days and customers churn.”"
            : "Anchors the whole plan — roadmap framing, epic descriptions, executive narrative."}
        </p>
        <textarea
          value={values.problemStatement}
          onChange={(e) => onChange({ problemStatement: e.target.value })}
          rows={3}
          placeholder="The problem, in plain language…"
          className={`w-full ${FIELD_CLASS}`}
        />
      </label>

      <label className="block text-sm font-medium text-text-primary">
        Who is the target customer?
        <p className="mt-1 mb-1.5 text-xs text-text-muted">
          {verbose
            ? "Name the person, not the market. Every user story is written from this persona's point of view. Example: “billing support agents at mid-market SaaS companies.”"
            : "Drives user story personas and acceptance criteria context."}
        </p>
        <textarea
          value={values.targetCustomer}
          onChange={(e) => onChange({ targetCustomer: e.target.value })}
          rows={2}
          placeholder="e.g. billing support agents at mid-market SaaS companies"
          className={`w-full ${FIELD_CLASS}`}
        />
      </label>
    </div>
  );
}
