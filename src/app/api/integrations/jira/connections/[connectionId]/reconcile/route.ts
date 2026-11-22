import { randomUUID } from "node:crypto";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { auditInitiative } from "@/lib/audit";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { jiraHash } from "@/lib/jira/crypto";
import { jiraConnectionForUser } from "@/lib/jira/routeAccess";

async function handler(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const { connectionId } = await params;
  const access = await jiraConnectionForUser(auth.user, connectionId);
  if (!access.ok) return access.response;
  const connection = access.connection;
  if (connection.status !== "connected" || !connection.initiativeId || !connection.cloudId || !connection.projectKey) {
    return jsonError("Connect a Jira site, project, and initiative before rechecking delivery.", 422);
  }
  const pending = await db.jiraSyncJob.findFirst({ where: { connectionId, jobType: "delivery_reconcile", status: { in: ["queued", "processing"] } }, select: { id: true } });
  if (pending) return Response.json({ jobId: pending.id, alreadyQueued: true });
  const job = await withTransaction(async () => {
    const created = await db.jiraSyncJob.create({ data: {
      organizationId: connection.organizationId,
      initiativeId: connection.initiativeId!,
      connectionId,
      jobType: "delivery_reconcile",
      payload: {},
      idempotencyKey: jiraHash(`delivery-reconcile:${connectionId}:${randomUUID()}`),
    } });
    await auditInitiative(connection.initiativeId!, "jira.delivery_reconcile_queued", { jiraJobId: created.id, jiraConnectionId: connectionId, actorUserId: auth.user.id });
    return created;
  });
  return Response.json({ jobId: job.id, alreadyQueued: false }, { status: 202 });
}

export const POST = withAuthenticatedApi(handler);
