import { notFound, redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import Breadcrumb from "@/components/ui/Breadcrumb";
import PageHeader from "@/components/ui/PageHeader";
import InitiativeAccessPanel from "@/components/admin/InitiativeAccessPanel";
import { listGrantsForInitiative } from "@/lib/access/initiativeAccess";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The one real "who has access" screen (docs/V2-RESOURCE-ACCESS.md §13/§18)
 * — reached from ADMIN -> Access, from an initiative's own "Who has access?"
 * link, and from Team Detail's "manage on the Access page" link. All three
 * land here and read/write the same InitiativeAccess rows.
 */
export default async function InitiativeAccessPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") redirect("/home");

  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!initiative || initiative.organizationId !== actor.organizationId) notFound();

  const [grants, orgUsers, orgTeams] = await Promise.all([
    listGrantsForInitiative(initiativeId),
    db.user.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, memberType: true },
    }),
    db.team.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const grantedUserIds = new Set(grants.individuals.map((g) => g.userId));
  const grantedTeamIds = new Set(grants.teams.map((g) => g.teamId));

  return (
    <ContainedLayout className="max-w-4xl">
      <Breadcrumb items={[{ label: "Access", href: "/admin/access" }, { label: initiative.name }]} />
      <div className="mt-2">
        <PageHeader eyebrow="Admin" title={initiative.name} description="Who has access to this initiative." />
      </div>
      <div className="mt-6">
        <InitiativeAccessPanel
          initiativeId={initiative.id}
          teams={grants.teams}
          individuals={grants.individuals}
          candidateUsers={orgUsers.filter((u) => !grantedUserIds.has(u.id))}
          candidateTeams={orgTeams.filter((t) => !grantedTeamIds.has(t.id))}
        />
      </div>
    </ContainedLayout>
  );
}
