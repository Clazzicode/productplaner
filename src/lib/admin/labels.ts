// Display labels shared across the Users/Teams admin screens (Step 8B).

// Guided-activation restructure (reference doc §13): relabeled to the
// reference doc's permission-tier language (Member / Organization Admin).
// This is the only permission tier surfaced in the UI today — the finer
// Workspace-Admin-vs-Organization-Admin split the doc also lists exists
// server-side (OrganizationMember.role: member|admin|owner, resolved fresh
// per request as getCurrentUser().permissionRole) but isn't displayed
// anywhere yet; every current display (this file's consumers) reads
// User.accessLevel, documented as a fallback/seed value, not the
// authoritative per-org role. Surfacing the real 3-tier split would mean
// reworking admin/users' data source from User.accessLevel to a per-org
// OrganizationMember.role join — a real, separate change, not done here.
export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  standard_user: "Member",
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
