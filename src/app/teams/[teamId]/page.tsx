import { notFound, redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { Card, CardTitle } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import TeamDetailPanel from "@/components/admin/TeamDetailPanel";
import TeamInitiativeAccessPanel from "@/components/admin/TeamInitiativeAccessPanel";
import { listGrantsForTeam } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** ORGANIZATION -> Teams & Stakeholders -> Team Detail. Admin-aware. */
export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");

  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { members: { include: { user: { select: { id: true, name: true, email: true, memberType: true, status: true } } } } },
  });
  if (!team || team.organizationId !== user.organizationId) notFound();

  const [orgUsers, initiativeGrants, orgInitiatives] = await Promise.all([
    db.user.findMany({
      where: { homeOrganizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    listGrantsForTeam(teamId),
    db.initiative.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const memberIds = new Set(team.members.map((m) => m.user.id));
  const grantedInitiativeIds = new Set(initiativeGrants.map((g) => g.initiativeId));

  return (
    <ContainedLayout className="max-w-4xl">
      <Breadcrumb items={[{ label: "Teams & Stakeholders", href: "/teams" }, { label: team.name }]} />
      <div className="mt-2">
        <PageHeader eyebrow="Organization" title={team.name} description={team.description || undefined} />
      </div>

      <div className="mt-6">
        <TeamDetailPanel
          teamId={team.id}
          isOrgAdmin={user.accessLevel === "org_admin"}
          members={team.members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            memberType: m.user.memberType,
            status: m.user.status,
          }))}
          candidateUsers={orgUsers.filter((u) => !memberIds.has(u.id))}
        />
      </div>

      <Card className="mt-4">
        <CardTitle>Initiative Access</CardTitle>
        <TeamInitiativeAccessPanel
          teamId={team.id}
          isOrgAdmin={user.accessLevel === "org_admin"}
          grants={initiativeGrants}
          candidateInitiatives={orgInitiatives.filter((i) => !grantedInitiativeIds.has(i.id))}
        />
      </Card>
    </ContainedLayout>
  );
}
