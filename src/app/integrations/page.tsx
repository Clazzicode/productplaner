import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import IntegrationsHub, {
  type HubConnection,
  type HubProvider,
} from "@/components/integrations/IntegrationsHub";
import CoachMark from "@/components/coachmarks/CoachMark";
import AtlassianOAuthConnection from "@/components/integrations/AtlassianOAuthConnection";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";
import MeetingProviderConnections from "@/components/integrations/MeetingProviderConnections";
import Link from "next/link";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";

export const dynamic = "force-dynamic";

async function IntegrationsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await ensureProvidersSeeded();
  const authorizedIds = await listAuthorizedInitiativeIds(user);

  const [providers, connections, initiatives, projects, jiraConnections] = await Promise.all([
    db.integrationProvider.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: { capabilities: { orderBy: { capabilityKey: "asc" } } },
    }),
    db.integrationConnection.findMany({
      where: { organizationId: user.organizationId },
      include: {
        initiative: { select: { name: true } },
        syncLogs: { orderBy: { startedAt: "desc" }, take: 5 },
      },
    }),
    db.initiative.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
    db.project.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.jiraConnection.findMany({ where: { organizationId: user.organizationId, initiativeId: { in: authorizedIds ?? [] }, projectKey: { not: null }, status: { not: "revoked" } }, select: { id: true, initiativeId: true, projectKey: true, status: true } }),
  ]);
  const jiraInitiatives = await db.initiative.findMany({
    where: { id: { in: jiraConnections.map(connection => connection.initiativeId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true, project: { select: { id: true, name: true } } },
  });
  const importedCounts = jiraConnections.length ? await db.jiraExternalLink.groupBy({
    by: ["connectionId"],
    where: { organizationId: user.organizationId, connectionId: { in: jiraConnections.map(connection => connection.id) } },
    _count: { _all: true },
  }) : [];

  const hubProviders: HubProvider[] = providers.filter((p) => !["jira", "google_calendar", "zoom", "notion"].includes(p.key)).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    category: p.category,
    description: p.description,
    isFeatured: p.isFeatured,
    capabilities: p.capabilities.map((c) => c.capabilityLabel),
  }));

  const hubConnections: HubConnection[] = connections.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    status: c.status,
    isEnabled: c.isEnabled,
    initiativeId: c.initiativeId,
    initiativeName: c.initiative?.name ?? null,
    workspaceName: c.workspaceName,
    projectKey: c.projectKey,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastSyncMessage: c.lastSyncMessage,
    logs: c.syncLogs.map((l) => ({
      id: l.id,
      syncType: l.syncType,
      status: l.status,
      itemsProcessed: l.itemsProcessed,
      message: l.message,
      startedAt: l.startedAt.toISOString(),
    })),
  }));

  const generated = initiatives.filter((i) => i.status === "generated");
  const hubConnectionsForDemo = hubConnections.filter((c) => {
    const provider = providers.find((p) => p.id === c.providerId);
    return provider && !["jira", "google_calendar", "zoom", "notion"].includes(provider.key);
  });
  return (
    <ContainedLayout>
      <PageHeader
        title="Integrations"
        description="Connect Google Calendar, Google Meet, Zoom, and Notion to bring meetings and notes into your planning workspace."
      />
      <CoachMark coachMarkKey="integrations" className="mt-4" />
      <div className="mt-6">
        <AtlassianOAuthConnection canManage={user.permissionRole === "owner" || user.permissionRole === "admin"} />
      </div>
      <section aria-labelledby="jira-imports-title" className="mt-6 rounded-2xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)]">
        <h2 id="jira-imports-title" className="text-lg font-semibold text-text-primary">Jira imports by product</h2>
        <p className="mt-1 text-sm text-text-secondary">Workspace access allows Jira to be read. Only approved imports create work in a selected product and feature.</p>
        <div className="mt-4 space-y-3">
          {projects.map(project => {
            const imports = jiraConnections.flatMap(connection => {
              const initiative = jiraInitiatives.find(row => row.id === connection.initiativeId && row.project?.id === project.id);
              return initiative ? [{ connection, initiative, count: importedCounts.find(row => row.connectionId === connection.id)?._count._all ?? 0 }] : [];
            });
            return <div key={project.id} className="rounded-xl border border-[#dfe3ee] p-4">
              <h3 className="font-semibold text-text-primary">{project.name}</h3>
              {imports.length ? <ul className="mt-2 space-y-2">{imports.map(({ connection, initiative, count }) => <li key={connection.id} className="text-sm text-text-secondary">
                <Link href={`/initiatives/${initiative.id}/backlog`} className="font-semibold text-indigo-700 hover:underline">{initiative.name}</Link>
                <span> · Jira {connection.projectKey} · {count} imported {count === 1 ? "item" : "items"}{connection.status !== "connected" ? ` · ${connection.status.replaceAll("_", " ")}` : ""}</span>
              </li>)}</ul> : <p className="mt-2 text-sm text-text-secondary">No Jira project linked or imported in this product.</p>}
            </div>;
          })}
        </div>
      </section>
      <div className="mt-6"><MeetingProviderConnections /></div>
      <div className="mt-6">
        <IntegrationsHub
          providers={hubProviders}
          connections={hubConnectionsForDemo}
          initiatives={generated.map((i) => ({ id: i.id, name: i.name }))}
          defaultInitiativeId={generated[0]?.id ?? null}
        />
      </div>
    </ContainedLayout>
  );
}

export default withAuthenticatedPage(IntegrationsPage);
