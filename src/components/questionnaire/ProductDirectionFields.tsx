export interface ProductDirectionValues {
  name: string;
  description: string;
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
      <label className="block text-sm font-medium">
        Initiative name
        <input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Customer Self-Service Portal"
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
      </label>

      <label className="block text-sm font-medium">
        What are you building? <span className="font-normal text-neutral-400">(optional)</span>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          placeholder="A sentence or two — the rest of this flow draws the details out of you."
          className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label className="block text-sm font-medium">
        What problem are you solving?
        <p className="mt-1 mb-1.5 text-xs text-neutral-500">
          {verbose
            ? "Describe the pain in the customer's world — not your solution. This answer anchors the whole plan: it frames the roadmap, feeds every epic description, and opens the executive narrative. Example: “Support agents juggle five disconnected tools to answer one billing question, so responses take days and customers churn.”"
            : "Anchors the whole plan — roadmap framing, epic descriptions, executive narrative."}
        </p>
        <textarea
          value={values.problemStatement}
          onChange={(e) => onChange({ problemStatement: e.target.value })}
          rows={3}
          placeholder="The problem, in plain language…"
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label className="block text-sm font-medium">
        Who is the target customer?
        <p className="mt-1 mb-1.5 text-xs text-neutral-500">
          {verbose
            ? "Name the person, not the market. Every user story is written from this persona's point of view. Example: “billing support agents at mid-market SaaS companies.”"
            : "Drives user story personas and acceptance criteria context."}
        </p>
        <textarea
          value={values.targetCustomer}
          onChange={(e) => onChange({ targetCustomer: e.target.value })}
          rows={2}
          placeholder="e.g. billing support agents at mid-market SaaS companies"
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
    </div>
  );
}
