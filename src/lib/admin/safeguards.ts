// Step 8B admin safeguards (docs/V2-USERS-TEAMS.md, docs/V2-ORG-ADMIN-IA.md §20).
// Pure, server-only checks against real persisted User rows.

import { db } from "@/lib/db";

/**
 * True if `userId` is currently an active Organization Admin and no other
 * active Organization Admin exists in the same organization. Used to block
 * both "disable this user" and "demote this user to Standard User" when it
 * would leave the organization with zero admins.
 */
export async function isLastActiveOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.accessLevel !== "org_admin" || target.status !== "active") return false;

  const otherActiveAdmins = await db.user.count({
    where: {
      homeOrganizationId: organizationId,
      accessLevel: "org_admin",
      status: "active",
      id: { not: userId },
    },
  });
  return otherActiveAdmins === 0;
}
