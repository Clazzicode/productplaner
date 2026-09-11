import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import { Badge } from "@/components/ui/Badge";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { Card, CardTitle } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import UserDetailForm from "@/components/admin/UserDetailForm";
import { formatAccessLabel, listResolvedAccessForUser } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** ADMIN -> Users -> User Detail (docs/V2-ORG-ADMIN-IA.md §21). Org Admin only. */
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const actor = await requireCurrentUser();
  establishAuthContext(actor.authUserId);
  if (actor.profiles.length === 0) redirect("/welcome");
  if (actor.accessLevel !== "org_admin") redirect("/home");

  const target = await db.user.findUnique({
    where: { id: userId },
    include: { teamMemberships: { include: { team: { select: { id: true, name: true } } } } },
  });
  if (!target || target.homeOrganizationId !== actor.organizationId) notFound();

  const [orgTeams, resolvedAccess] = await Promise.all([
    db.team.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listResolvedAccessForUser(userId),
  ]);

  return (
    <ContainedLayout className="max-w-4xl">
      <Breadcrumb items={[{ label: "Users", href: "/admin/users" }, { label: target.name }]} />
      <div className="mt-2">
        <PageHeader eyebrow="Admin" title={target.name} description={target.email} />
      </div>

      <div className="mt-6">
        <UserDetailForm
          user={{
            id: target.id,
            name: target.name,
            email: target.email,
            accessLevel: target.accessLevel,
            workingRole: target.workingRole,
            memberType: target.memberType,
            status: target.status,
          }}
          currentTeams={target.teamMemberships.map((m) => ({ id: m.team.id, name: m.team.name }))}
          allTeams={orgTeams}
        />
      </div>

      <Card className="mt-4">
        <CardTitle>Resource Access</CardTitle>
        {resolvedAccess.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            No initiative access yet — see{" "}
            <Link href="/admin/access" className="text-indigo-600 hover:underline">
              Access
            </Link>{" "}
            to grant some.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {resolvedAccess.map((row) => (
              <li key={row.initiativeId} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/admin/access/${row.initiativeId}`} className="font-medium text-indigo-600 hover:underline">
                  {row.initiativeName}
                </Link>
                <span className="flex items-center gap-2 text-xs text-text-muted">
                  <Badge variant={row.access.level === "owner" ? "indigo" : row.access.level === "edit" ? "emerald" : "neutral"}>
                    {formatAccessLabel(row.access.level, row.access.sourceLabel)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ContainedLayout>
  );
}
