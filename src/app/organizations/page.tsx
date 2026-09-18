import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import OrganizationSwitcher from "@/components/auth/OrganizationSwitcher";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);

  const memberships = await db.organizationMember.findMany({
    where: { authUserId: user.authUserId!, status: "active" },
    include: { organization: { select: { id: true, name: true, workspaceType: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <ContainedLayout className="max-w-2xl">
      <PageHeader
        eyebrow="Account"
        title="Your organizations"
        description="Switch which organization's data you're currently viewing."
      />
      <div className="mt-6">
        <OrganizationSwitcher
          activeOrganizationId={user.organizationId}
          organizations={memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            workspaceType: m.organization.workspaceType,
            role: m.role,
          }))}
        />
      </div>
    </ContainedLayout>
  );
}
