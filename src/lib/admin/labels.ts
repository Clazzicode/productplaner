// Display labels shared across the Users/Teams admin screens (Step 8B).

export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  standard_user: "Standard User",
  org_admin: "Organization Admin",
};

export const WORKING_ROLE_LABELS: Record<string, string> = {
  product_management: "Product Management",
  project_manager: "Project Manager",
  product_owner: "Product Owner",
  // Guided-activation restructure (reference doc §13): added to the Working
  // Role list — see src/lib/onboarding/roleOptions.ts's WORKING_ROLE_META.
  business_analyst: "Business Analyst",
  founder_business_lead: "Founder / Business Lead",
  other: "Other",
};

export const MEMBER_TYPE_LABELS: Record<string, string> = {
  internal: "Internal",
  external: "External / Guest",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  disabled: "Disabled",
  archived: "Archived",
};
