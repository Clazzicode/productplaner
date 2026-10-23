import { createHash } from "node:crypto";
import { z } from "zod";
import {
  applyJiraStatusSnapshot,
  getJiraStatusSyncContext,
  isLinkedInstallation,
} from "@/lib/atlassian/installations";
import { JiraApiError, readMappedIssueStatuses } from "@/lib/atlassian/jiraApi";
import { ForgeAuthenticationError, verifyForgeInvocation } from "@/lib/atlassian/forgeAuth";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";

const requestSchema = z.object({ projectBindingId: z.string().trim().min(1).max(191) }).strict();

async function POSTHandler(request: Request) {
  try {
    const invocation = await verifyForgeInvocation(request);
    if (!await isLinkedInstallation(invocation)) {
      return Response.json({ error: "Connect this Jira site to an organization first." }, { status: 403 });
    }
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid Jira status refresh request." }, { status: 422 });
    const syncContext = await getJiraStatusSyncContext(parsed.data.projectBindingId, invocation);
    if (!syncContext) return Response.json({ error: "The mapped Jira project is unavailable." }, { status: 404 });
    if (syncContext.mappedIssues.length > 50) {
      return Response.json({ error: "This Jira project has more than 50 mapped issues; refresh pages separately." }, { status: 409 });
    }

    const allowedIssues = new Map(syncContext.mappedIssues.map((item) => [item.jiraIssueKey, item.jiraIssueId]));
    const result = await readMappedIssueStatuses(
      request,
      invocation,
      syncContext.mappedIssues.map((item) => item.jiraIssueKey),
    );
    const observations = result.issues.flatMap((issue) => {
      if (allowedIssues.get(issue.key) !== issue.id) return [];
      const snapshotHash = createHash("sha256").update(JSON.stringify([
        issue.id, issue.key, issue.statusId, issue.statusName, issue.updatedAt,
      ])).digest("hex");
      return [{
        jiraIssueId: issue.id,
        jiraIssueKey: issue.key,
        statusId: issue.statusId,
        statusName: issue.statusName,
        updatedAt: issue.updatedAt,
        snapshotHash,
      }];
    });
    const persisted = await applyJiraStatusSnapshot(parsed.data.projectBindingId, invocation, observations);
    return Response.json({ ok: true, ...persisted, fetched: observations.length, jiraWriteOperations: 0 });
  } catch (error) {
    if (error instanceof ForgeAuthenticationError) {
      return Response.json({ error: "Invalid Forge invocation." }, { status: 401 });
    }
    if (error instanceof JiraApiError) {
      const status = error.status === 401 || error.status === 403 ? error.status
        : error.status === 422 ? 422 : error.status === 429 ? 429 : 502;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}

export const POST = withApi(POSTHandler, { forgeRemote: true });
