import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { checkRateLimit, rateLimitPolicyFor } from "@/lib/rateLimit";
import { assertEnvironmentIsolation, EnvironmentIsolationError } from "@/lib/environment";

const context = new AsyncLocalStorage<{ requestId: string }>();
export function currentRequestId() { return context.getStore()?.requestId; }

/** Allowlisted fields only: no headers, bodies, tokens, URLs or error messages. */
export function serverLog(event: string, fields: { status?: number; durationMs?: number; errorType?: string } = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: (fields.status ?? 0) >= 500 ? "error" : "info",
    event,
    requestId: currentRequestId(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...fields,
  });
  if ((fields.status ?? 0) >= 500) console.error(payload);
  else console.log(payload);
}

export function withApi<T extends unknown[]>(handler: (...args: T) => Promise<Response>, options?: { diagnostic?: boolean }) {
  return async (...args: T): Promise<Response> => context.run({ requestId: randomUUID() }, async () => {
    const started = Date.now();
    try {
      if (!options?.diagnostic) assertEnvironmentIsolation();
      const request = args[0] instanceof Request ? args[0] : null;
      if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return Response.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
        }
        const policy = rateLimitPolicyFor(request);
        if (policy) {
          const result = await checkRateLimit(request, policy);
          if (!result.allowed) {
            serverLog("api.rate_limited", { status: 429 });
            return Response.json(
              { error: "Too many requests. Please wait and try again.", requestId: currentRequestId() },
              {
                status: 429,
                headers: {
                  "x-request-id": currentRequestId()!,
                  "cache-control": "no-store",
                  "retry-after": String(result.retryAfterSeconds),
                  "x-ratelimit-limit": String(policy.limit),
                  "x-ratelimit-remaining": String(result.remaining),
                },
              },
            );
          }
        }
      }
      const response = await handler(...args);
      response.headers.set("x-request-id", currentRequestId()!);
      response.headers.set("cache-control", "no-store");
      serverLog("api.completed", { status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      const status = error instanceof EnvironmentIsolationError ? 503 : code === "P2034" ? 409 : error instanceof SyntaxError ? 400 : 500;
      serverLog("api.failed", { status, durationMs: Date.now() - started, errorType: error instanceof Error ? error.name : "UnknownError" });
      return Response.json({ error: status === 409 ? "The plan changed concurrently. Refresh and try again." : status === 400 ? "Invalid request." : "Request failed.", requestId: currentRequestId() }, {
        status, headers: { "x-request-id": currentRequestId()!, "cache-control": "no-store" },
      });
    }
  });
}
