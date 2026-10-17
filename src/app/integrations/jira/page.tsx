import JiraIntegrationManager from "@/components/integrations/JiraIntegrationManager";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";

export const dynamic = "force-dynamic";

export default async function JiraIntegrationPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await ensureProvidersSeeded();
  const [initiatives, connections] = await Promise.all([
    db.initiative.findMany({ where: { organizationId: user.organizationId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    db.jiraConnection.findMany({
      where: { organizationId: user.organizationId, status: { not: "revoked" } }, orderBy: { updatedAt: "desc" },
      select: { id: true, initiativeId: true, status: true, cloudId: true, siteUrl: true, siteName: true, projectId: true, projectKey: true, projectName: true, accessibleResources: true, revision: true, tokenExpiresAt: true, lastImportedAt: true, createdAt: true, updatedAt: true },
    }),
  ]);
  const latestRuns = connections.length ? await db.jiraImportRun.findMany({ where: { connectionId: { in: connections.map((row) => row.id) } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  const latestRun = latestRuns[0] ?? null;
  const items = latestRun ? await db.jiraImportItem.findMany({ where: { importRunId: latestRun.id }, orderBy: [{ action: "asc" }, { externalKey: "asc" }] }) : [];
  return (
    <ContainedLayout>
      <PageHeader title="Jira Cloud" description="Connect through Atlassian OAuth, preview Jira work, and explicitly approve each import. Guided Planning remains the planning system of record." />
      <div className="mt-6"><JiraIntegrationManager initiatives={initiatives} connections={connections.map((row) => ({ ...row, tokenExpiresAt: row.tokenExpiresAt.toISOString(), lastImportedAt: row.lastImportedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} latestRun={latestRun ? { ...latestRun, appliedAt: latestRun.appliedAt?.toISOString() ?? null, createdAt: latestRun.createdAt.toISOString(), updatedAt: latestRun.updatedAt.toISOString() } : null} latestItems={items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} canManage={user.permissionRole === "owner" || user.permissionRole === "admin"} /></div>
    </ContainedLayout>
  );
}
