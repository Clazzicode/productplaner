import type { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/businessError";
import { jiraHash } from "@/lib/jira/crypto";
import { enqueueWebhook } from "@/lib/jira/webhooks";
import { withApi } from "@/lib/observability";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function handler(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params; const token = new URL(request.url).searchParams.get("token") ?? "";
  const raw = await request.text(); if (!token || raw.length > 1_000_000) return Response.json({ error: "Invalid webhook." }, { status: token ? 413 : 401 });
  let payload: unknown; try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const row = object(payload); const issue = object(row.issue);
  const externalEventId = request.headers.get("x-atlassian-webhook-identifier") || jiraHash(raw);
  try {
    const queued = await enqueueWebhook({ connectionId, token, externalEventId, eventType: String(row.webhookEvent ?? "unknown"), issueId: issue.id ? String(issue.id) : null, issueKey: issue.key ? String(issue.key) : null, payload: payload as Prisma.InputJsonValue, payloadHash: jiraHash(raw) });
    return Response.json({ accepted: true, duplicate: !queued.created }, { status: queued.created ? 202 : 200 });
  } catch (error) { return Response.json({ error: error instanceof BusinessError ? error.message : "Invalid Jira webhook." }, { status: error instanceof BusinessError ? error.status : 401 }); }
}
export const POST = withApi(handler);
