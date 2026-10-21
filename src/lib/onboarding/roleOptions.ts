import type { WorkingRole } from "./types";

/** Launched working roles offered during onboarding and in Settings. */
// Product Owner is the only launched working experience. Keep the other
// metadata for existing records and future workflows, but do not offer those
// unfinished experiences to new or existing users.
export const WORKING_ROLE_ORDER: WorkingRole[] = ["product_owner"];

/** Display copy for launched and legacy/future working-role values. Working
 * role never grants access; organization permissions are separate. */
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
