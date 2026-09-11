import type { WorkingRole } from "./types";

/** Single source of truth for Working Role display copy — previously
 * duplicated verbatim across WorkingRoleSelector, ProductDirectionBootstrap,
 * and WelcomeQualifying. Stored values are unchanged; only `product_management`'s
 * label was renamed ("Product Management" -> "Product Manager") to match the
 * platform's three primary roles (Product Manager, Product Owner, Project Manager). */
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
};
