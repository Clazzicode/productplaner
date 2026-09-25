// Display labels shared across the Users/Teams admin screens (Step 8B).

// Guided-activation restructure (reference doc §13): relabeled to the
// reference doc's permission-tier language (Member / Organization Admin).
// Kept for the mutation path — PATCH /api/admin/users/[userId] only ever
// toggles User.accessLevel between these two values (see that route's own
// comment for why it never assigns "owner").
export const ACCESS_LEVEL_LABELS: Record<string, string> = {
  standard_user: "Member",
  org_admin: "Organization Admin",
};

// The real, per-organization 3-tier role (OrganizationMember.role:
// member|admin|owner — see getCurrentUser().permissionRole in
// src/lib/auth/session.ts). Surfaced read-only in the Users list and User
// Detail page so an Organization Admin can tell the actual org Owner apart
// from other admins they've promoted — both collapse to the same
// ACCESS_LEVEL_LABELS entry ("Organization Admin") since the mutation route
// can't distinguish or reassign ownership.
export const PERMISSION_ROLE_LABELS: Record<string, string> = {
  member: "Member",
  admin: "Workspace Admin",
  owner: "Organization Admin",
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
