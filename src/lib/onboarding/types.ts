// Step 4 (V2 onboarding) temporary state — not persisted to Prisma yet.
// See docs/V2-ONBOARDING.md for the persistence plan.

// Guided-activation restructure (reference doc §13): expanded from the
// original 3 values to the reference doc's full 6-option Working Role list.
// Purely additive — existing product_management/project_manager/product_owner
// values are untouched, so no data migration is needed (see roleOptions.ts).
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
