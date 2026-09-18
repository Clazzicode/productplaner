import type { WorkingRole } from "./types";

/** The three primary roles offered during onboarding and in Settings
 * (directive item 7: "Do not add Developer as a primary role") — same
 * values/order WorkingRoleSelector.tsx already hardcodes locally, shared
 * here so Settings doesn't need a third duplicate of this list. */
export const WORKING_ROLE_ORDER: WorkingRole[] = ["product_management", "product_owner", "project_manager"];

/** Single source of truth for Working Role display copy — previously
 * duplicated verbatim across WorkingRoleSelector, ProductDirectionBootstrap,
 * and WelcomeQualifying. Stored values are unchanged; only `product_management`'s
 * label was renamed ("Product Management" -> "Product Manager") to match the
 * platform's primary roles (Product Manager, Product Owner, Project Manager).
 *
 * Guided-activation restructure (reference doc §13): added Business Analyst,
 * Founder/Business Lead, and Other to match the reference doc's full list —
 * these were previously funneled into a "Something else" answer that told
 * the user this probably wasn't the right tool for them (WelcomeQualifying's
 * old role step). They're real, accepted roles now, same as the original
 * three — Working Role never affects access/authorization regardless of
 * which of the six is picked. */
export const WORKING_ROLE_META: Record<WorkingRole, { label: string; description: string; focus: string[] }> = {
  product_management: {
    label: "Product Manager",
    description: "Own the roadmap and product outcomes.",
    focus: ["Roadmap", "Features", "Product health", "Decisions", "Releases", "Outcomes"],
  },
  project_manager: {
    label: "Project Manager",
    description: "Keep delivery on schedule and on budget.",
    focus: ["Schedules", "Milestones", "Dependencies", "Risks", "Capacity", "Delivery health"],
  },
  product_owner: {
    label: "Product Owner",
    description: "Own the backlog and translate strategy into shippable work.",
    focus: ["Feature backlog", "User stories", "Acceptance criteria", "Sprint work", "Dependencies", "Decisions"],
  },
  business_analyst: {
    label: "Business Analyst",
    description: "Translate business needs into clear, buildable requirements.",
    focus: ["Requirements", "Process flows", "Stakeholder alignment", "Acceptance criteria", "Dependencies", "Decisions"],
  },
  founder_business_lead: {
    label: "Founder / Business Lead",
    description: "Drive the product and the business at the same time.",
    focus: ["Roadmap", "Outcomes", "Capacity & cost", "Decisions", "Releases", "Product health"],
  },
  other: {
    label: "Other",
    description: "Something else — the platform still adapts to how you work.",
    focus: ["Roadmap", "Features", "Sprint work", "Decisions", "Releases", "Product health"],
  },
};
