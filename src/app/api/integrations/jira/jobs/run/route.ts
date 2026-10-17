import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { processJiraJobs } from "@/lib/jira/jobs";
import { requireJiraManager } from "@/lib/jira/routeAccess";
import { withApi } from "@/lib/observability";

async function handler() {
  const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response; establishAuthContext(auth.user.authUserId);
  const access = await requireJiraManager(auth.user); if (!access.ok) return access.response;
  return Response.json(await processJiraJobs(10, undefined, auth.user.organizationId));
}
export const POST = withApi(handler);
