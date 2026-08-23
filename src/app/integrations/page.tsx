import IntegrationsHub, {
  type HubConnection,
  type HubProvider,
} from "@/components/integrations/IntegrationsHub";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await ensureProvidersSeeded();
  const user = await getCurrentUser();

  const [providers, connections, initiatives] = await Promise.all([
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
  ]);

  const hubProviders: HubProvider[] = providers.map((p) => ({
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
  const connectedCount = hubConnections.filter(
    (c) => c.isEnabled && c.status !== "available",
  ).length;

  return (
    <ContainedLayout>
      <PageHeader
        title="Integrations"
        description={`Demo-mode connection hub — ${connectedCount} of ${hubProviders.length} tools connected. The platform stays the system of record; execution tools receive the work.`}
      />
      <div className="mt-6">
        <IntegrationsHub
          providers={hubProviders}
          connections={hubConnections}
          initiatives={generated.map((i) => ({ id: i.id, name: i.name }))}
          defaultInitiativeId={generated[0]?.id ?? null}
        />
      </div>
    </ContainedLayout>
  );
}
