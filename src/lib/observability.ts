import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const context = new AsyncLocalStorage<{ requestId: string }>();
export function currentRequestId() { return context.getStore()?.requestId; }

/** Allowlisted fields only: no headers, bodies, tokens, URLs or error messages. */
export function serverLog(event: string, fields: { status?: number; durationMs?: number; errorType?: string } = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, requestId: currentRequestId(), ...fields }));
}

export function withApi<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => context.run({ requestId: randomUUID() }, async () => {
    const started = Date.now();
    try {
      const request = args[0] instanceof Request ? args[0] : null;
      if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return Response.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
        }
      }
      const response = await handler(...args);
      response.headers.set("x-request-id", currentRequestId()!);
      response.headers.set("cache-control", "no-store");
      serverLog("api.completed", { status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      const status = code === "P2034" ? 409 : error instanceof SyntaxError ? 400 : 500;
      serverLog("api.failed", { status, durationMs: Date.now() - started, errorType: error instanceof Error ? error.name : "UnknownError" });
      return Response.json({ error: status === 409 ? "The plan changed concurrently. Refresh and try again." : status === 400 ? "Invalid request." : "Request failed.", requestId: currentRequestId() }, {
        status, headers: { "x-request-id": currentRequestId()!, "cache-control": "no-store" },
      });
    }
  });
}
