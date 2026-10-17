import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { auditOrganization } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { accessibleJiraResources, decryptedTokens, deleteJiraWebhooks, encryptedTokens, exchangeJiraCode, getJiraProjectMetadata, jiraAuthorizationUrl, listJiraProjects, refreshJiraTokens, type JiraProject, type JiraProjectMetadata, type JiraResource } from "./client";
import { encryptJiraSecret, jiraHash } from "./crypto";
import type { JiraProjectInput } from "./model";

const STATE_LIFETIME_MS = 10 * 60 * 1000;

export function publicJiraConnection<T extends { accessTokenCiphertext: string; refreshTokenCiphertext: string }>(row: T) {
  const safe = { ...row } as Partial<T>;
  delete safe.accessTokenCiphertext;
  delete safe.refreshTokenCiphertext;
  return safe as Omit<T, "accessTokenCiphertext" | "refreshTokenCiphertext">;
}

export async function beginJiraOAuth(input: { organizationId: string; initiativeId: string | null; userId: string; returnPath: string }) {
  const state = randomBytes(32).toString("base64url");
  await db.jiraOAuthState.create({ data: { stateHash: jiraHash(state), organizationId: input.organizationId, initiativeId: input.initiativeId, userId: input.userId, returnPath: input.returnPath, expiresAt: new Date(Date.now() + STATE_LIFETIME_MS) } });
  return jiraAuthorizationUrl(state);
}

async function mirrorHubConnection(connection: { organizationId: string; initiativeId: string | null; configuredByUserId: string; status: string; siteName: string | null; siteUrl: string | null; projectKey: string | null; projectName: string | null }) {
  const provider = await db.integrationProvider.findUnique({ where: { key: "jira" } });
  if (!provider) return;
  const existing = await db.integrationConnection.findFirst({ where: { organizationId: connection.organizationId, initiativeId: connection.initiativeId, providerId: provider.id } });
  const enabled = connection.status !== "revoked";
  const data = { connectionName: "Jira Cloud", status: connection.status === "connected" ? "sync_ready" : enabled ? "needs_configuration" : "available", mode: "live", workspaceName: connection.siteName, workspaceUrl: connection.siteUrl, projectKey: connection.projectKey, projectName: connection.projectName, configuredByUserId: connection.configuredByUserId, configuredAt: new Date(), isEnabled: enabled, settingsJson: "{}" };
  if (existing) await db.integrationConnection.update({ where: { id: existing.id }, data });
  else await db.integrationConnection.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId, providerId: provider.id, ...data } });
}

export async function completeJiraOAuth(input: { state: string; code: string; userId: string; organizationId: string }) {
  const stateHash = jiraHash(input.state);
  const pending = await db.jiraOAuthState.findUnique({ where: { stateHash } });
  if (!pending || pending.userId !== input.userId || pending.organizationId !== input.organizationId || pending.consumedAt || pending.expiresAt <= new Date()) throw new BusinessError("This Jira authorization request is invalid or expired.", 400);
  const tokens = await exchangeJiraCode(input.code);
  const resources = await accessibleJiraResources(tokens.accessToken);
  if (!resources.length) throw new BusinessError("Atlassian did not grant access to a Jira Cloud site.", 422);
  return withTransaction(async () => {
    const consumed = await db.jiraOAuthState.updateMany({ where: { id: pending.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new BusinessError("This Jira authorization request was already used.", 409);
    const oldConnections = await db.jiraConnection.findMany({ where: { organizationId: input.organizationId, initiativeId: pending.initiativeId, status: { not: "revoked" } } });
    await db.jiraConnection.updateMany({ where: { id: { in: oldConnections.map((row) => row.id) } }, data: { status: "revoked", revision: { increment: 1 } } });
    const saved = await db.jiraConnection.create({ data: { organizationId: input.organizationId, initiativeId: pending.initiativeId, configuredByUserId: input.userId, ...encryptedTokens(tokens), accessibleResources: resources as unknown as Prisma.InputJsonValue, status: resources.length === 1 ? "project_selection_required" : "site_selection_required", ...(resources.length === 1 ? { cloudId: resources[0].id, siteUrl: resources[0].url, siteName: resources[0].name } : {}) } });
    await mirrorHubConnection(saved);
    await auditOrganization({ organizationId: input.organizationId, actorUserId: input.userId, entityType: "jira_connection", entityId: saved.id, action: "jira.oauth_connected", metadata: { initiativeId: saved.initiativeId, availableSiteCount: resources.length } });
    return { connection: saved, returnPath: pending.returnPath };
  });
}

export async function accessTokenFor(connectionId: string) {
  const current = await db.jiraConnection.findUnique({ where: { id: connectionId } });
  if (!current || current.status === "revoked") throw new BusinessError("Jira connection not found.", 404);
  const tokens = decryptedTokens(current);
  if (current.tokenExpiresAt.getTime() > Date.now() + 60_000) return { connection: current, accessToken: tokens.accessToken };
  try {
    const refreshed = await refreshJiraTokens(tokens.refreshToken);
    const update = await db.jiraConnection.updateMany({ where: { id: current.id, revision: current.revision, status: { not: "revoked" } }, data: { ...encryptedTokens(refreshed), revision: { increment: 1 } } });
    if (update.count !== 1) return accessTokenFor(connectionId);
    return { connection: await db.jiraConnection.findUniqueOrThrow({ where: { id: current.id } }), accessToken: refreshed.accessToken };
  } catch (error) {
    await db.jiraConnection.updateMany({ where: { id: current.id, status: { not: "revoked" } }, data: { status: "reauthorization_required", revision: { increment: 1 } } });
    throw new BusinessError(error instanceof Error ? `Reconnect Jira: ${error.message}` : "Reconnect Jira.", 401);
  }
}

function resourcesFrom(value: Prisma.JsonValue): JiraResource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, Prisma.JsonValue> => Boolean(row && typeof row === "object" && !Array.isArray(row))).map((row) => ({ id: String(row.id ?? ""), url: String(row.url ?? ""), name: String(row.name ?? ""), scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [] })).filter((row) => row.id && row.url);
}

export async function selectJiraSite(connectionId: string, cloudId: string, expectedRevision: number) {
  const row = await db.jiraConnection.findUnique({ where: { id: connectionId } });
  if (!row) throw new BusinessError("Jira connection not found.", 404);
  const resource = resourcesFrom(row.accessibleResources).find((item) => item.id === cloudId);
  if (!resource) throw new BusinessError("Choose a Jira site granted by Atlassian.", 422);
  const changed = await db.jiraConnection.updateMany({ where: { id: connectionId, revision: expectedRevision, status: { not: "revoked" } }, data: { cloudId: resource.id, siteUrl: resource.url, siteName: resource.name, projectId: null, projectKey: null, projectName: null, status: "project_selection_required", revision: { increment: 1 } } });
  if (changed.count !== 1) throw new BusinessError("The Jira connection changed. Reload and try again.", 409);
  const saved = await db.jiraConnection.findUniqueOrThrow({ where: { id: connectionId } });
  await mirrorHubConnection(saved);
  return publicJiraConnection(saved);
}

export async function discoverJiraProjects(connectionId: string): Promise<JiraProject[]> {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (!connection.cloudId) throw new BusinessError("Choose a Jira site first.", 422);
  return listJiraProjects(connection.cloudId, accessToken);
}

export async function discoverJiraProjectMetadata(connectionId: string, projectId: string): Promise<JiraProjectMetadata> {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (!connection.cloudId) throw new BusinessError("Choose a Jira site first.", 422);
  const projects = await listJiraProjects(connection.cloudId, accessToken);
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new BusinessError("Choose a Jira project available to this connection.", 422);
  return getJiraProjectMetadata({ cloudId: connection.cloudId, accessToken, projectId: project.id, projectKey: project.key });
}

export async function configureJiraProject(connectionId: string, input: JiraProjectInput) {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (!connection.cloudId) throw new BusinessError("Choose a Jira site first.", 422);
  const projects = await listJiraProjects(connection.cloudId, accessToken);
  const project = projects.find((item) => item.id === input.projectId && item.key === input.projectKey);
  if (!project) throw new BusinessError("Choose a Jira project available to this connection.", 422);
  const changed = await db.jiraConnection.updateMany({ where: { id: connectionId, revision: input.expectedRevision, status: { not: "revoked" } }, data: { projectId: project.id, projectKey: project.key, projectName: project.name, issueTypeMappings: input.issueTypeMappings, fieldMappings: { storyPointsField: input.storyPointsField, statusMappings: input.statusMappings, priorityMappings: input.priorityMappings }, status: "connected", revision: { increment: 1 } } });
  if (changed.count !== 1) throw new BusinessError("The Jira connection changed. Reload and try again.", 409);
  const saved = await db.jiraConnection.findUniqueOrThrow({ where: { id: connectionId } });
  await mirrorHubConnection(saved);
  await auditOrganization({ organizationId: saved.organizationId, actorUserId: saved.configuredByUserId, entityType: "jira_connection", entityId: saved.id, action: "jira.project_configured", metadata: { initiativeId: saved.initiativeId, cloudId: saved.cloudId, projectKey: saved.projectKey } });
  return publicJiraConnection(saved);
}

export async function disconnectJira(connectionId: string, actorUserId: string) {
  const current = await db.jiraConnection.findUnique({ where: { id: connectionId } });
  if (!current || current.status === "revoked") throw new BusinessError("Jira connection not found.", 404);
  const subscription = await db.jiraWebhookSubscription.findUnique({ where: { connectionId } });
  let remoteWebhookWarning: string | null = null;
  if (subscription && current.cloudId) {
    try {
      const { accessToken } = await accessTokenFor(connectionId);
      await deleteJiraWebhooks({ cloudId: current.cloudId, accessToken, webhookIds: [subscription.externalId] });
    } catch (error) {
      remoteWebhookWarning = error instanceof Error ? error.message : "The remote Jira webhook could not be removed.";
    }
  }
  const saved = await withTransaction(async () => {
    await db.jiraWebhookSubscription.updateMany({ where: { connectionId }, data: { status: "disabled" } });
    await db.jiraSyncJob.updateMany({ where: { connectionId, status: { in: ["queued", "processing"] } }, data: { status: "cancelled", lockedAt: null, lockedBy: null, lastError: "Connection disconnected by an administrator." } });
    const revoked = await db.jiraConnection.update({ where: { id: connectionId }, data: { status: "revoked", accessTokenCiphertext: encryptJiraSecret(randomBytes(32).toString("base64url")), refreshTokenCiphertext: encryptJiraSecret(randomBytes(32).toString("base64url")), tokenExpiresAt: new Date(), revision: { increment: 1 } } });
    await auditOrganization({ organizationId: current.organizationId, actorUserId, entityType: "jira_connection", entityId: current.id, action: "jira.disconnected", metadata: { initiativeId: current.initiativeId, remoteWebhookRemoved: !remoteWebhookWarning, remoteWebhookWarning } });
    return revoked;
  });
  await mirrorHubConnection(saved);
  return { connection: publicJiraConnection(saved), remoteWebhookWarning };
}
