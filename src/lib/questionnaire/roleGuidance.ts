import type { WorkingRole } from "@/lib/onboarding/types";

/**
 * Two independent guidance dimensions (docs/V2-QUESTIONNAIRE-MAP.md §6):
 * - Working Role (from V2 onboarding) changes EMPHASIS — which section-level framing
 *   resonates — never which fields are required or how generation behaves.
 * - Experience Level (from Section 1, replacing the old QualifyingProfile.role-based
 *   verbosity flag) changes DEPTH — how much explanatory text each field shows.
 */

export type QuestionnaireSection =
  | "productDirection"
  | "success"
  | "capabilities"
  | "delivery"
  | "execution"
  | "review";

// Guided-activation restructure (reference doc §13): Business Analyst,
// Founder/Business Lead, and Other joined the Working Role list — each gets
// its own emphasis copy below, in the same voice as the original three,
// rather than falling back to a generic default.
const EMPHASIS: Record<QuestionnaireSection, Record<WorkingRole, string>> = {
  productDirection: {
    product_management:
      "Ground the plan in the customer and the problem — everything downstream traces back to this.",
    project_manager:
      "This frames scope before anything gets scheduled — get it right and the delivery plan follows.",
    product_owner:
      "This context feeds every story and acceptance criterion the engine writes later — worth being specific.",
    business_analyst:
      "This becomes the requirement baseline you'll trace every story back to — precision here pays off downstream.",
    founder_business_lead:
      "This is the story you'll tell customers and investors — get the problem and the bet right.",
    other: "Ground the plan in the problem you're solving — everything downstream traces back to this.",
  },
  success: {
    product_management: "Define the outcome you're accountable for — the roadmap sequences toward it.",
    project_manager: "This sets the target the schedule and release plan are measured against.",
    product_owner: "Knowing the target outcome explains why features get prioritized the way they do.",
    business_analyst: "This is the acceptance bar stakeholders will measure delivered requirements against.",
    founder_business_lead: "This is the outcome the whole business is betting on — the roadmap sequences toward it.",
    other: "Define the outcome you're aiming for — the roadmap sequences toward it.",
  },
  capabilities: {
    product_management: "This becomes your roadmap — MVP scope, business value, and what ships when.",
    project_manager: "This becomes your delivery sequence — dependencies and risk drive scheduling.",
    product_owner: "Each feature becomes your backlog — effort size drives how much gets generated.",
    business_analyst: "Each of these becomes a documented requirement — dependencies drive how they're sequenced.",
    founder_business_lead: "This becomes your build sequence — what ships first shapes what the business can sell.",
    other: "This becomes your plan — what's most valuable and most urgent ships first.",
  },
  delivery: {
    product_management: "Capacity math happens here so you don't have to think about it on the roadmap.",
    project_manager: "This is your capacity model — team size and assumptions drive the sprint/release plan.",
    product_owner: "These numbers set sprint capacity — story points and pacing come from here.",
    business_analyst: "These assumptions set the capacity requirements are planned against.",
    founder_business_lead: "These numbers translate your team's time into a realistic delivery pace.",
    other: "Capacity math happens here so you don't have to think about it on the roadmap.",
  },
  execution: {
    product_management: "How the team executes doesn't change what ships — just how it's sequenced.",
    project_manager:
      "Methodology changes real behavior — locking rules, sprint packing, and drag-and-drop all branch on this.",
    product_owner: "This decides whether your backlog locks in strict phases or flows continuously.",
    business_analyst: "This decides how requirements move from documented to done — locked phases or continuous flow.",
    founder_business_lead: "How the team executes doesn't change what ships — just how fast and how predictably.",
    other: "This decides how work moves from planned to done — locked phases or continuous flow.",
  },
  review: {
    product_management: "Check the story and the outcome before generating — everything else can be tuned later.",
    project_manager: "Check assumptions and dependencies before generating — they drive the schedule.",
    product_owner: "Check feature sizing and methodology before generating — they drive decomposition.",
    business_analyst: "Check requirement completeness and dependencies before generating — they drive traceability.",
    founder_business_lead: "Check the story and the outcome before generating — this is what you'll be accountable for.",
    other: "Check the story and the outcome before generating — everything else can be tuned later.",
  },
};

export function guidanceFor(section: QuestionnaireSection, role: WorkingRole | null): string {
  return EMPHASIS[section][role ?? "product_management"];
}

/** first_time/some_experience → longer, example-bearing help text (mirrors the depth the
 * old role+experienceLevel `verbose` flag produced — see docs/V2-QUESTIONNAIRE-MAP.md §6). */
export function depthFromExperience(experienceLevel: string | null | undefined): boolean {
  return experienceLevel === "first_time" || experienceLevel === "some_experience";
}

/** Same first_time/some_experience split as depthFromExperience, exposed under a name
 * that reflects what it now also decides: whether the simplified 5-question intake
 * (SimplifiedIntakeWizard) renders instead of the full PlanningQuestionnaire. "expert"
 * (a retired UI choice, still valid on old rows) is treated identically to "experienced". */
export function isSimplifiedIntakeExperience(experienceLevel: string | null | undefined): boolean {
  return depthFromExperience(experienceLevel);
}
