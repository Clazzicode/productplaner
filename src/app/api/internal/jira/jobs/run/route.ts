import { timingSafeEqual } from "node:crypto";
import { processJiraJobs } from "@/lib/jira/jobs";
import { db, withServiceContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim(); const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function handler(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await processJiraJobs(25);
  await withServiceContext(() => db.$executeRaw`SELECT app_private.expire_jira_source_data()`);
  return Response.json(result);
}
export const GET = withApi(handler);
export const POST = withApi(handler);
