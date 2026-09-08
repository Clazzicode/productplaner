import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import UsersTable from "@/components/admin/UsersTable";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * ADMIN -> Users (docs/V2-ORG-ADMIN-IA.md §21 "Users List"). Org Admin only —
 * unlike Teams & Stakeholders, this is not admin-aware/viewable, it's gated
 * entirely. See docs/V2-USERS-TEAMS.md "Security Limitation" for what this
 * check does and doesn't guarantee in a single-session prototype.
 */
export default async function AdminUsersPage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();
  if (user.accessLevel !== "org_admin") redirect("/home");

  const users = await db.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: {
      teamMemberships: { include: { team: { select: { id: true, name: true } } } },
    },
  });

  return (
    <ContainedLayout className="max-w-6xl">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Everyone in your organization — access level, working role, member type, and team membership."
      />
      <div className="mt-6">
        <UsersTable
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            accessLevel: u.accessLevel,
            workingRole: u.workingRole,
            memberType: u.memberType,
            status: u.status,
            teams: u.teamMemberships.map((m) => m.team.name),
          }))}
        />
      </div>
    </ContainedLayout>
  );
}
