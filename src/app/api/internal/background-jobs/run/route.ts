import { randomUUID } from "node:crypto";
import { runBackgroundWorkerBatch } from "@/lib/jobs/worker";
import { isAuthorizedWorkerRequest } from "@/lib/jobs/workerAuth";
import { withApi } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(request: Request) {
  const configured = [process.env.BACKGROUND_WORKER_SECRET, process.env.CRON_SECRET];
  if (!configured.some(Boolean)) {
    return Response.json({ error: "Background worker authentication is not configured." }, { status: 503 });
  }
  if (!isAuthorizedWorkerRequest(request, configured)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const workerId = `${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const outcomes = await runBackgroundWorkerBatch(workerId, Number(process.env.BACKGROUND_WORKER_BATCH_SIZE ?? 3));
  return Response.json({ processed: outcomes.length, outcomes });
}

export const GET = withApi(handler);
export const POST = withApi(handler);
