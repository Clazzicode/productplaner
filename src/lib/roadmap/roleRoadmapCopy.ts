import type { WorkingRole } from "@/lib/onboarding/types";

/**
 * Role-specific vocabulary for the role-differentiated roadmap panel
 * (roleRoadmapView.ts). Same pattern as roleOptions.ts/roleGuidance.ts — a
 * small typed constant object, not a new i18n framework. Product Manager and
 * Product Owner intentionally share one copy object ("closely connected"
 * experiences, per the platform's planning-perspective requirements).
 */
export interface RoleRoadmapCopy {
  pageTitle: string;
  itemNoun: string;
  itemNounPlural: string;
  dependencySentence: (blockedName: string, blockerName: string) => string;
  businessValueFraming: { label: string; factors: string[]; note: string };
}

const PRODUCT_ROADMAP_COPY: RoleRoadmapCopy = {
  pageTitle: "Product Roadmap",
  itemNoun: "Feature",
  itemNounPlural: "Features",
  dependencySentence: (blocked, blocker) => `${blocked} can't proceed until ${blocker} is complete.`,
  businessValueFraming: {
    label: "Business value factors",
    factors: ["Revenue impact", "Time to market"],
    note: "Business value for Product roles is driven primarily by revenue impact and time to market. Final scoring weights aren't set yet — this is framing only.",
  },
};

export const ROLE_ROADMAP_COPY: Record<WorkingRole, RoleRoadmapCopy> = {
  product_management: PRODUCT_ROADMAP_COPY,
  product_owner: PRODUCT_ROADMAP_COPY,
  project_manager: {
    pageTitle: "Project Roadmap",
    itemNoun: "Activity",
    itemNounPlural: "Activities",
    dependencySentence: (blocked, blocker) => `${blocked} can't begin until ${blocker} is complete.`,
    businessValueFraming: {
      label: "Business value factor",
      factors: ["Cost"],
      note: "Business value for the Project Manager view is centered on cost. How cost translates into a business-value score hasn't been finalized — this is framing only.",
    },
  },
};
