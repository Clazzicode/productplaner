import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import TeamsList from "@/components/admin/TeamsList";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * ORGANIZATION -> Teams & Stakeholders (docs/V2-ORG-ADMIN-IA.md §2, §6-7).
 * Admin-aware, not admin-only: every org member can view rosters; management
 * controls (create team, add/remove member) only render for an Organization
 * Admin, and are re-checked server-side in /api/admin/teams/* regardless of
 * what this page renders.
 */
export default async function TeamsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");

  const teams = await db.team.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { members: { include: { user: { select: { memberType: true } } } } },
  });

  return (
    <ContainedLayout>
      <PageHeader
        eyebrow="Organization"
        title="Teams & Stakeholders"
        description="Understand the teams and stakeholders contributing to planning and delivery."
      />
      <div className="mt-6">
        <TeamsList
          isOrgAdmin={user.accessLevel === "org_admin"}
          teams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            memberCount: t.members.length,
            externalCount: t.members.filter((m) => m.user.memberType === "external").length,
          }))}
        />
      </div>
    </ContainedLayout>
  );
}
