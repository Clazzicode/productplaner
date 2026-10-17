import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, rawDb } from "@/lib/db";
import { registerJiraWebhook, refreshJiraWebhook } from "./client";
import { jiraHash } from "./crypto";
import { accessTokenFor } from "./oauth";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function webhookBaseUrl() {
  const value = process.env.JIRA_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  if (!value || !value.startsWith("https://")) throw new BusinessError("Configure JIRA_WEBHOOK_BASE_URL with the production HTTPS origin.", 503);
  return value;
}

export async function registerWebhook(connectionId: string) {
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (!connection.initiativeId || !connection.cloudId || !connection.projectKey) throw new BusinessError("Finish the Jira connection before enabling webhooks.", 422);
  if (!connection.scopes.split(/\s+/).includes("manage:jira-webhook")) throw new BusinessError("Reconnect Jira and grant webhook management access.", 422);
  const secret = randomBytes(32).toString("base64url");
  const callbackUrl = `${webhookBaseUrl()}/api/integrations/jira/webhooks/${encodeURIComponent(connection.id)}?token=${encodeURIComponent(secret)}`;
  const registered = await registerJiraWebhook({ cloudId: connection.cloudId, accessToken, callbackUrl, projectKey: connection.projectKey });
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  const saved = await db.jiraWebhookSubscription.upsert({ where: { connectionId }, create: { organizationId: connection.organizationId, connectionId, externalId: registered.id, callbackSecretHash: jiraHash(secret), expiresAt }, update: { externalId: registered.id, callbackSecretHash: jiraHash(secret), status: "active", expiresAt, lastRenewedAt: new Date() } });
  await db.jiraSyncJob.updateMany({ where: { connectionId: connection.id, jobType: "renew_webhook", status: "queued" }, data: { status: "cancelled" } });
  await db.jiraSyncJob.upsert({ where: { idempotencyKey: jiraHash(`renew:${saved.id}:${expiresAt.toISOString()}`) }, create: { organizationId: connection.organizationId, initiativeId: connection.initiativeId, connectionId: connection.id, jobType: "renew_webhook", payload: { subscriptionId: saved.id }, idempotencyKey: jiraHash(`renew:${saved.id}:${expiresAt.toISOString()}`), availableAt: new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000) }, update: {} });
  await auditInitiative(connection.initiativeId, "jira.webhook_registered", { jiraConnectionId: connection.id, jiraWebhookSubscriptionId: saved.id, expiresAt: expiresAt.toISOString() });
  return saved;
}

export async function renewWebhook(connectionId: string) {
  const subscription = await db.jiraWebhookSubscription.findUnique({ where: { connectionId } });
  if (!subscription) throw new BusinessError("Register the Jira webhook before renewing it.", 404);
  const { connection, accessToken } = await accessTokenFor(connectionId);
  if (!connection.cloudId || !connection.initiativeId) throw new BusinessError("The Jira connection is incomplete.", 422);
  const result = await refreshJiraWebhook({ cloudId: connection.cloudId, accessToken, webhookId: subscription.externalId });
  const saved = await db.jiraWebhookSubscription.update({ where: { id: subscription.id }, data: { expiresAt: result.expiresAt, lastRenewedAt: new Date(), status: "active" } });
  await db.jiraSyncJob.upsert({ where: { idempotencyKey: jiraHash(`renew:${saved.id}:${saved.expiresAt.toISOString()}`) }, create: { organizationId: connection.organizationId, initiativeId: connection.initiativeId, connectionId: connection.id, jobType: "renew_webhook", payload: { subscriptionId: saved.id }, idempotencyKey: jiraHash(`renew:${saved.id}:${saved.expiresAt.toISOString()}`), availableAt: new Date(saved.expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000) }, update: {} });
  await auditInitiative(connection.initiativeId, "jira.webhook_renewed", { jiraWebhookSubscriptionId: saved.id, expiresAt: saved.expiresAt.toISOString() });
  return saved;
}

export async function enqueueWebhook(input: { connectionId: string; token: string; externalEventId: string; eventType: string; issueId: string | null; issueKey: string | null; payload: Prisma.InputJsonValue; payloadHash: string }) {
  const secretHash = jiraHash(input.token);
  const rows = await rawDb.$queryRaw<{ event_id: string; created: boolean }[]>`
    SELECT * FROM app_private.enqueue_jira_webhook(${input.connectionId},${secretHash},${input.externalEventId},${input.eventType},${input.issueId},${input.issueKey},${input.payloadHash},${input.payload}::jsonb)`;
  if (!rows[0]) throw new BusinessError("Invalid Jira webhook.", 401);
  return { eventId: rows[0].event_id, created: rows[0].created };
}
