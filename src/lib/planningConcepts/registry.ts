/**
 * Planning Concept Registry — the platform's explicit, product-team-owned
 * record of what each planning concept means, what determines it, what the
 * user provides, how the system interprets it, and what it produces. Where
 * the product team hasn't defined a piece of methodology yet, that part is
 * marked `needs_business_rule` with a specific, named gap — never a guessed
 * or AI-invented default. Status is scored per PART, not per concept: a
 * concept's factors can be recognized (defined) while its scoring thresholds
 * remain undefined (needs_business_rule).
 *
 * This is the source of truth `PendingBusinessRule` (src/components/ui/PendingBusinessRule.tsx)
 * renders from — never duplicate a gap's description as a second hardcoded string.
 */

export type PlanningConceptStatus = "defined" | "needs_business_rule";

export interface PlanningConceptPart {
  status: PlanningConceptStatus;
  detail: string;
}

export interface PlanningConcept {
  id: string;
  title: string;
  role: "product_management_and_product_owner" | "project_manager";
  /** (1) What the term means in this platform. */
  meaning: PlanningConceptPart;
  /** (2) What factors determine it. */
  factors: PlanningConceptPart;
  /** (3) What information the user provides. */
  userInputs: PlanningConceptPart;
  /** (4) How the system interprets that information. */
  interpretation: PlanningConceptPart;
  /** (5) What output, score, recommendation, or roadmap placement results. */
  output: PlanningConceptPart;
}

export const PLANNING_CONCEPTS: PlanningConcept[] = [
  {
    id: "business_value_pm_po",
    title: "Business Value — Product Manager / Product Owner",
    role: "product_management_and_product_owner",
    meaning: {
      status: "defined",
      detail: "Business value from a product perspective, framed by Revenue Impact and Time to Market.",
    },
    factors: {
      status: "defined",
      detail: "Revenue Impact and Time to Market are the recognized primary factors for Product roles.",
    },
    userInputs: {
      status: "needs_business_rule",
      detail:
        "No dedicated Revenue Impact or Time-to-Market input fields exist yet — today's intake only collects a single generic 5-level Business Value pick that doesn't decompose into these two factors.",
    },
    interpretation: {
      status: "needs_business_rule",
      detail:
        "What qualifies as Low, Medium, or High revenue impact, what qualifies as Low, Medium, or High time-to-market importance, and how the two factors should be weighted are not yet defined by the product team.",
    },
    output: {
      status: "needs_business_rule",
      detail: "How a combined Revenue Impact / Time to Market score should influence priority is not yet defined.",
    },
  },
  {
    id: "business_value_project_manager",
    title: "Business Value — Project Manager",
    role: "project_manager",
    meaning: {
      status: "defined",
      detail: "Business value from the Project Manager perspective is centered on Cost.",
    },
    factors: {
      status: "defined",
      detail: "Cost is the recognized primary factor for the Project Manager view.",
    },
    userInputs: {
      status: "needs_business_rule",
      detail:
        "Raw cost data (budget, hourly rate, capacity assumptions) is already collected, but which of those inputs should feed a business-value judgment hasn't been decided.",
    },
    interpretation: {
      status: "needs_business_rule",
      detail:
        "Whether cost should be evaluated by staying within budget, reducing cost, avoiding unnecessary cost, comparing cost against expected benefit, or another method has not been defined by the product team.",
    },
    output: {
      status: "needs_business_rule",
      detail: "The final cost-to-business-value calculation has not been defined.",
    },
  },
  {
    id: "risk_project_manager",
    title: "Risk — Project Manager",
    role: "project_manager",
    meaning: {
      status: "defined",
      detail: "Risk for the Project Manager view is assessed using a SWOT (Strengths, Weaknesses, Opportunities, Threats) framework.",
    },
    factors: {
      status: "defined",
      detail: "Strengths, Weaknesses, Opportunities, and Threats are the chosen assessment categories.",
    },
    userInputs: {
      status: "defined",
      detail:
        "SWOT groupings are inferred from already-collected signals (per-feature risk level, sprint over-allocation, dependency cycles, cost/schedule health) — there is no dedicated SWOT-authoring input yet.",
    },
    interpretation: {
      status: "needs_business_rule",
      detail: "What creates Low, Medium, or High risk, and how SWOT findings should affect a final risk level, have not been defined by the product team.",
    },
    output: {
      status: "needs_business_rule",
      detail: "No overall Low/Medium/High risk level is produced for this role until that mapping is defined.",
    },
  },
  {
    id: "risk_pm_po",
    title: "Risk — Product Manager / Product Owner",
    role: "product_management_and_product_owner",
    meaning: {
      status: "needs_business_rule",
      detail: "The Product risk methodology has not been fully defined yet. It must not automatically reuse the Project Manager SWOT methodology.",
    },
    factors: {
      status: "needs_business_rule",
      detail: "No risk factors have been chosen for Product roles yet.",
    },
    userInputs: {
      status: "needs_business_rule",
      detail: "No dedicated Product-role risk inputs exist yet.",
    },
    interpretation: {
      status: "needs_business_rule",
      detail: "This rule is left configurable until the product team finalizes the Product risk methodology.",
    },
    output: {
      status: "needs_business_rule",
      detail: "No Product-role risk output is produced until a methodology is defined.",
    },
  },
];

export function planningConceptById(id: string): PlanningConcept | undefined {
  return PLANNING_CONCEPTS.find((c) => c.id === id);
}
