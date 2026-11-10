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
import NotionConnection from "@/components/integrations/NotionConnection";

export const dynamic = "force-dynamic";

async function IntegrationsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await ensureProvidersSeeded();

  const [providers, connections, personalConnections, initiatives] = await Promise.all([
    db.integrationProvider.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: { capabilities: { orderBy: { capabilityKey: "asc" } } },
    }),
    db.integrationConnection.findMany({
      where: { organizationId: user.organizationId },
      include: {
        provider: { select: { key: true } },
        initiative: { select: { name: true } },
        syncLogs: { orderBy: { startedAt: "desc" }, take: 5 },
      },
    }),
    db.personalIntegrationConnection.findMany({ where: { organizationId: user.organizationId, userId: user.id }, select: { provider: true, accountEmail: true, accountLabel: true } }),
    db.initiative.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

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
  const connectedCount = hubConnectionsForDemo.filter(
    (c) => c.isEnabled && c.status !== "available",
  ).length;

  return (
    <ContainedLayout>
      <PageHeader
        title="Integrations"
        description="Connect your own Google Calendar, Google Meet, Zoom, and Notion accounts. Your meeting invitations and calendar schedule use your connected account."
      />
      <CoachMark coachMarkKey="integrations" className="mt-4" />
      <div className="mt-6">
        <AtlassianOAuthConnection canManage={user.permissionRole === "owner" || user.permissionRole === "admin"} />
      </div>
      <div className="mt-6">
        <MeetingProviderConnections
          canManage
          connections={(["google_calendar", "zoom"] as const).map((key) => ({
            provider: key,
            connected: personalConnections.some((connection) => connection.provider === key),
            accountEmail: personalConnections.find((connection) => connection.provider === key)?.accountEmail ?? null,
          }))}
        />
      </div>
      <div className="mt-6"><NotionConnection canManage connected={personalConnections.some((connection) => connection.provider === "notion")} accountLabel={personalConnections.find((connection) => connection.provider === "notion")?.accountLabel ?? null} /></div>
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
