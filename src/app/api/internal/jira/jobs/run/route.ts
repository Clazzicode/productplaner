import { timingSafeEqual } from "node:crypto";
import { processJiraJobs } from "@/lib/jira/jobs";
import { db, withServiceContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import { observeWorker } from "@/lib/jobs/executionHealth";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim(); const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected) return false;
  const presented = Buffer.from(actual); const configured = Buffer.from(expected);
  return presented.length === configured.length && timingSafeEqual(presented, configured);
}
async function handler(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await observeWorker("jira", async stage => {
    stage("execute");
    const data = await processJiraJobs(25);
    stage("retention");
    await withServiceContext(async () => await db.$executeRaw`SELECT app_private.expire_jira_source_data()`);
    return { data, counts: { processed: data.claimed, completed: data.completed, retried: data.retried, failed: data.failed } };
  });
  return Response.json(result);
}
export const GET = withApi(handler);
export const POST = withApi(handler);
