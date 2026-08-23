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

const EMPHASIS: Record<QuestionnaireSection, Record<WorkingRole, string>> = {
  productDirection: {
    product_management:
      "Ground the plan in the customer and the problem — everything downstream traces back to this.",
    project_manager:
      "This frames scope before anything gets scheduled — get it right and the delivery plan follows.",
    developer:
      "This context feeds every story and acceptance criterion the engine writes later — worth being specific.",
  },
  success: {
    product_management: "Define the outcome you're accountable for — the roadmap sequences toward it.",
    project_manager: "This sets the target the schedule and release plan are measured against.",
    developer: "Knowing the target outcome explains why capabilities get prioritized the way they do.",
  },
  capabilities: {
    product_management: "This becomes your roadmap — MVP scope, business value, and what ships when.",
    project_manager: "This becomes your delivery sequence — dependencies and risk drive scheduling.",
    developer: "Each capability becomes epics and stories — effort size drives how much gets generated.",
  },
  delivery: {
    product_management: "Capacity math happens here so you don't have to think about it on the roadmap.",
    project_manager: "This is your capacity model — team size and assumptions drive the sprint/release plan.",
    developer: "These numbers set sprint capacity — story points and pacing come from here.",
  },
  execution: {
    product_management: "How the team executes doesn't change what ships — just how it's sequenced.",
    project_manager:
      "Methodology changes real behavior — locking rules, sprint packing, and drag-and-drop all branch on this.",
    developer: "This decides whether work locks in strict phases or flows as a continuous backlog.",
  },
  review: {
    product_management: "Check the story and the outcome before generating — everything else can be tuned later.",
    project_manager: "Check assumptions and dependencies before generating — they drive the schedule.",
    developer: "Check capability sizing and methodology before generating — they drive decomposition.",
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
