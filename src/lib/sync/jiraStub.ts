import { db } from "@/lib/db";
import { assertDemoIntegrationsEnabled } from "./demoPolicy";

// STUB ONLY (per scope): simulates FR-14's one-way Jira push entirely locally.
// No HTTP call leaves this module — "sync" writes fake DEMO-n keys onto epics
// and stories and stamps the connection. The platform stays system of record.

const FAKE_PROJECT_KEY = "DEMO";

export async function connectJira(initiativeId: string) {
  assertDemoIntegrationsEnabled();
  return db.syncConnection.upsert({
    where: { initiativeId_tool: { initiativeId, tool: "jira" } },
    create: {
      initiativeId,
      tool: "jira",
      status: "connected",
      connectedAt: new Date(),
      fakeProjectKey: FAKE_PROJECT_KEY,
    },
    update: { status: "connected", connectedAt: new Date(), fakeProjectKey: FAKE_PROJECT_KEY },
  });
}

export async function syncToJira(initiativeId: string): Promise<{
  pushed: number;
  projectKey: string;
}> {
  assertDemoIntegrationsEnabled();
  const conn = await db.syncConnection.findUnique({
    where: { initiativeId_tool: { initiativeId, tool: "jira" } },
  });
  if (!conn || conn.status !== "connected") {
    throw new Error("Connect Jira before syncing.");
  }
  const prototype = await db.prototype.findUnique({ where: { initiativeId } });
  if (!prototype) throw new Error("Nothing to sync — generate the prototype first.");

  // Simulated network latency so the UI's syncing state is visible.
  await new Promise((resolve) => setTimeout(resolve, 800));

  const items = await db.artifactLayer.findMany({
    where: { prototypeId: prototype.id, type: { in: ["epic", "story"] } },
    orderBy: [{ type: "asc" }, { order: "asc" }],
    select: { id: true, externalRef: true },
  });

  let counter = 100;
  for (const item of items) {
    counter += 1;
    if (!item.externalRef) {
      await db.artifactLayer.update({
        where: { id: item.id },
        data: { externalRef: `${FAKE_PROJECT_KEY}-${counter}` },
      });
    }
  }

  await db.syncConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date() },
  });

  return { pushed: items.length, projectKey: FAKE_PROJECT_KEY };
}
