import { redirect } from "next/navigation";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import JiraIntegrationManager from "@/components/integrations/JiraIntegrationManager";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";

export const dynamic = "force-dynamic";

async function JiraIntegrationPage({ searchParams }: { searchParams: Promise<{ connectionId?: string }> }) {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (!requireOrganizationRole(user, ["owner", "admin"]).ok) redirect("/initiatives");
  const requestedConnection = (await searchParams).connectionId;
  await ensureProvidersSeeded();
  const [initiatives, connections] = await Promise.all([
    db.initiative.findMany({ where: { organizationId: user.organizationId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    db.jiraConnection.findMany({
      where: { organizationId: user.organizationId, status: { not: "revoked" } }, orderBy: { updatedAt: "desc" },
      select: { id: true, initiativeId: true, status: true, cloudId: true, siteUrl: true, siteName: true, projectId: true, projectKey: true, projectName: true, accessibleResources: true, revision: true, tokenExpiresAt: true, lastImportedAt: true, lastSyncAt: true, lastSyncStatus: true, createdAt: true, updatedAt: true },
    }),
  ]);
  const activeConnectionId = connections.find((row) => row.id === requestedConnection)?.id ?? connections[0]?.id;
  const latestRuns = connections.length ? await db.jiraImportRun.findMany({ where: { connectionId: activeConnectionId }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, connectionId: true, status: true, itemCount: true, createCount: true, updateCount: true, conflictCount: true, unchangedCount: true, appliedAt: true, readCompletedAt: true, connectionRevision: true, createdAt: true, updatedAt: true } }) : [];
  const latestRun = latestRuns[0] ?? null;
  const items = latestRun ? await db.jiraImportItem.findMany({ where: { importRunId: latestRun.id }, orderBy: [{ action: "asc" }, { externalKey: "asc" }], select: { id: true, externalKey: true, issueTypeName: true, targetType: true, targetId: true, reviewSnapshot: true, summary: true, action: true, conflictReason: true, selected: true, status: true, createdAt: true, updatedAt: true } }) : [];
  const latestExports = process.env.JIRA_WRITE_ENABLED === "true" && connections.length ? await db.jiraExportRun.findMany({ where: { connectionId: activeConnectionId }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, connectionId: true, status: true, itemCount: true, createCount: true, updateCount: true, conflictCount: true, unchangedCount: true, executedAt: true, createdAt: true, updatedAt: true } }) : [];
  const latestExport = latestExports[0] ?? null;
  const exportItems = latestExport ? await db.jiraExportItem.findMany({ where: { exportRunId: latestExport.id }, orderBy: [{ action: "asc" }, { summary: "asc" }], select: { id: true, externalKey: true, externalIssueId: true, createAttemptedAt: true, requestPayload: true, targetType: true, targetId: true, reviewSnapshot: true, summary: true, action: true, conflictReason: true, selected: true, status: true, failureMessage: true, createdAt: true, updatedAt: true } }) : [];
  const [webhookSubscriptions, syncJobs, syncConflicts] = connections.length ? await Promise.all([
    db.jiraWebhookSubscription.findMany({ where: { connectionId: { in: connections.map((row) => row.id) } }, orderBy: { updatedAt: "desc" }, select: { connectionId: true, status: true, expiresAt: true, lastRenewedAt: true } }),
    db.jiraSyncJob.findMany({ where: { connectionId: { in: connections.map((row) => row.id) } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, connectionId: true, jobType: true, status: true, attemptCount: true, maxAttempts: true, availableAt: true, lastError: true } }),
    db.jiraSyncConflict.findMany({ where: { connectionId: { in: connections.map((row) => row.id) }, status: "open" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, connectionId: true, externalKey: true, targetType: true, explanation: true, status: true, createdAt: true } }),
  ]) : [[], [], []];
  return (
    <ContainedLayout>
      <PageHeader title="Jira Cloud" description="Connect through Atlassian OAuth, refresh a read-only Jira preview, and explicitly approve each import. Clarivia remains the planning system of record." />
      <div className="mt-6"><JiraIntegrationManager initiatives={initiatives} connections={connections.map((row) => ({ ...row, tokenExpiresAt: row.tokenExpiresAt.toISOString(), lastImportedAt: row.lastImportedAt?.toISOString() ?? null, lastSyncAt: row.lastSyncAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} latestRun={latestRun ? { ...latestRun, appliedAt: latestRun.appliedAt?.toISOString() ?? null, readCompletedAt: latestRun.readCompletedAt?.toISOString() ?? null, createdAt: latestRun.createdAt.toISOString(), updatedAt: latestRun.updatedAt.toISOString() } : null} latestItems={items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} latestExport={latestExport ? { ...latestExport, executedAt: latestExport.executedAt?.toISOString() ?? null, createdAt: latestExport.createdAt.toISOString(), updatedAt: latestExport.updatedAt.toISOString() } : null} latestExportItems={exportItems.map((row) => ({ ...row, createAttemptedAt: row.createAttemptedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))} webhookSubscriptions={webhookSubscriptions.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString(), lastRenewedAt: row.lastRenewedAt.toISOString() }))} syncJobs={syncJobs.map((row) => ({ ...row, availableAt: row.availableAt.toISOString() }))} syncConflicts={syncConflicts.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} canManage={true} canWriteToJira={process.env.JIRA_WRITE_ENABLED === "true"} /></div>
    </ContainedLayout>
  );
}

export default withAuthenticatedPage(JiraIntegrationPage);
