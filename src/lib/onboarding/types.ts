// Step 4 (V2 onboarding) temporary state — not persisted to Prisma yet.
// See docs/V2-ONBOARDING.md for the persistence plan.

export type WorkingRole = "product_management" | "project_manager" | "developer";

export interface OnboardingState {
  organizationName?: string;
  companySize?: string;
  industry?: string;
  workingRole?: WorkingRole;
  complete?: boolean;
}
