// Integrations Hub demo engine (Product platform spec §2.6/§2.10):
// zero outbound HTTP, fake success states, fake issue keys, persisted
// connection state and sync logs. Coexists deliberately with the legacy
// Jira-only jiraStub.ts used by the workspace JiraSyncPanel.

import { db } from "@/lib/db";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ConnectArgs {
  organizationId: string;
  providerKey: string;
  initiativeId: string | null; // null = org-wide connection
  configuredByUserId: string;
  workspaceName?: string;
  workspaceUrl?: string;
  projectKey?: string;
  projectName?: string;
  settings?: Record<string, unknown>;
}

async function providerByKey(providerKey: string) {
  const provider = await db.integrationProvider.findUnique({ where: { key: providerKey } });
  if (!provider || !provider.isActive) throw new Error("Unknown integration provider.");
  return provider;
}

/** Connect or reconfigure a demo connection. Configured = has a project key. */
export async function connectDemo(args: ConnectArgs) {
  const provider = await providerByKey(args.providerKey);
  const configured = Boolean(args.projectKey?.trim() || provider.category !== "execution");
  const status = configured ? "demo_connected" : "needs_configuration";
  const data = {
    connectionName: `${provider.name} (demo)`,
    status,
    mode: "demo",
    workspaceName: args.workspaceName ?? null,
    workspaceUrl: args.workspaceUrl ?? null,
    projectKey: args.projectKey?.trim().toUpperCase() || null,
    projectName: args.projectName ?? null,
    configuredByUserId: args.configuredByUserId,
    configuredAt: new Date(),
    isEnabled: true,
    settingsJson: JSON.stringify(args.settings ?? {}),
  };
  // findFirst + update/create instead of upsert: the compound unique includes
  // a nullable initiativeId, which Postgres/Prisma can't match on NULL.
  const existing = await db.integrationConnection.findFirst({
    where: {
      organizationId: args.organizationId,
      providerId: provider.id,
      initiativeId: args.initiativeId,
    },
  });
  if (existing) {
    return db.integrationConnection.update({ where: { id: existing.id }, data });
  }
  return db.integrationConnection.create({
    data: {
      organizationId: args.organizationId,
      providerId: provider.id,
      initiativeId: args.initiativeId,
      ...data,
    },
  });
}

export async function disconnectDemo(connectionId: string) {
  return db.integrationConnection.update({
    where: { id: connectionId },
    data: { status: "available", isEnabled: false },
  });
}

export async function reconnectDemo(connectionId: string) {
  const conn = await db.integrationConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { provider: true },
  });
  const configured = Boolean(conn.projectKey || conn.provider.category !== "execution");
  return db.integrationConnection.update({
    where: { id: connectionId },
    data: { status: configured ? "demo_connected" : "needs_configuration", isEnabled: true },
  });
}

/**
 * Run a demo sync. Execution providers stamp fake issue keys onto epics and
 * stories (like the legacy Jira stub); other categories produce realistic
 * item counts and log entries only. Everything is recorded in the sync log.
 */
export async function runDemoSync(connectionId: string): Promise<{
  itemsProcessed: number;
  message: string;
}> {
  const conn = await db.integrationConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { provider: true },
  });
  if (!conn.isEnabled || conn.status === "available") {
    throw new Error("Connect the demo integration before syncing.");
  }
  if (conn.provider.category === "execution" && !conn.projectKey) {
    throw new Error("Configure a project key before running a demo sync.");
  }
  const startedAt = new Date();
  await sleep(700); // believable latency, still zero network

  // Resolve which initiative's plan to sync: the scoped one, else the
  // organization's most recently generated initiative.
  const initiative = conn.initiativeId
    ? await db.initiative.findUnique({
        where: { id: conn.initiativeId },
        include: { prototype: { select: { id: true } } },
      })
    : await db.initiative.findFirst({
        where: { organizationId: conn.organizationId, status: "generated" },
        orderBy: { updatedAt: "desc" },
        include: { prototype: { select: { id: true } } },
      });
  const prototypeId = initiative?.prototype?.id ?? null;

  let itemsProcessed = 0;
  let message = "";
  let syncType = "demo_sync";

  if (!prototypeId) {
    message = "No generated plan found to sync — generate a prototype first.";
  } else if (conn.provider.category === "execution") {
    syncType = "push_work_items";
    const targets = await db.artifactLayer.findMany({
      where: { prototypeId, type: { in: ["epic", "story"] }, externalRef: null },
      orderBy: [{ type: "asc" }, { order: "asc" }],
      select: { id: true },
    });
    const prefix = conn.projectKey ?? "DEMO";
    let n = 100;
    for (const t of targets) {
      n += 1;
      await db.artifactLayer.update({ where: { id: t.id }, data: { externalRef: `${prefix}-${n}` } });
    }
    itemsProcessed = targets.length;
    message = `${targets.length} items synced to ${conn.provider.name} demo project ${prefix}`;
  } else if (conn.provider.category === "roadmap") {
    syncType = "push_roadmap";
    itemsProcessed = await db.artifactLayer.count({
      where: { prototypeId, type: { in: ["roadmap_phase", "feature"] } },
    });
    message = `${itemsProcessed} roadmap items pushed to ${conn.provider.name} (demo)`;
  } else if (conn.provider.category === "documentation") {
    syncType = "publish_pages";
    itemsProcessed =
      1 + (await db.release.count({ where: { prototypeId } }));
    message = `${itemsProcessed} linked planning pages generated in ${conn.provider.name} (demo)`;
  } else if (conn.provider.category === "communication") {
    syncType = "post_digest";
    itemsProcessed = 1;
    message = `Plan digest posted to ${conn.provider.name} (demo)`;
  } else if (conn.provider.category === "design") {
    syncType = "link_designs";
    itemsProcessed = await db.artifactLayer.count({ where: { prototypeId, type: "feature" } });
    message = `${itemsProcessed} design placeholders linked in ${conn.provider.name} (demo)`;
  } else {
    syncType = "link_repos";
    itemsProcessed = await db.artifactLayer.count({ where: { prototypeId, type: "story" } });
    message = `${itemsProcessed} demo issue references prepared for ${conn.provider.name}`;
  }

  const success = prototypeId != null;
  await db.integrationSyncLog.create({
    data: {
      connectionId,
      syncType,
      status: success ? "success" : "error",
      itemsProcessed,
      message,
      startedAt,
      finishedAt: new Date(),
      detailsJson: JSON.stringify({ initiativeId: initiative?.id ?? null }),
    },
  });
  await db.integrationConnection.update({
    where: { id: connectionId },
    data: {
      status: success ? "sync_complete" : "demo_error",
      lastSyncAt: new Date(),
      lastSyncStatus: success ? "success" : "error",
      lastSyncMessage: message,
    },
  });

  return { itemsProcessed, message };
}
