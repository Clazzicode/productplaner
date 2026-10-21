// Step 4 (V2 onboarding) temporary state — not persisted to Prisma yet.
// See docs/V2-ONBOARDING.md for the persistence plan.

// Stored working-role values include legacy and future experiences. Only
// product_owner is selectable or writable until the others are launched.
export type WorkingRole =
  | "product_management"
  | "project_manager"
  | "product_owner"
  | "business_analyst"
  | "founder_business_lead"
  | "other";

export interface OnboardingState {
  organizationName?: string;
  companySize?: string;
  industry?: string;
  workingRole?: WorkingRole;
  /** Solo vs Team/Organization, asked as the first onboarding question.
   * "solo" skips the org name/size/industry fields entirely. */
  workspaceType?: "solo" | "team";
}
