import { createHash } from "node:crypto";
import { rawDb } from "@/lib/db";

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowSeconds: number;
}
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const AUTH_POLICIES: Record<string, RateLimitPolicy> = {
  "/api/auth/sign-in": { key: "auth.sign_in", limit: 10, windowSeconds: 600 },
  "/api/auth/sign-up": { key: "auth.sign_up", limit: 5, windowSeconds: 3600 },
};

/**
 * Limits only endpoints where brute force, unbounded AI usage, file processing,
 * integration sync, or destructive account actions have material impact.
 * Ordinary planning edits remain responsive and rely on authentication,
 * authorization, and CSRF checks already enforced by withApi().
 */
export function rateLimitPolicyFor(request: Request): RateLimitPolicy | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  const path = new URL(request.url).pathname;
  if (AUTH_POLICIES[path]) return AUTH_POLICIES[path];
  if (path === "/api/account/start-over") {
    return { key: "account.start_over", limit: 3, windowSeconds: 3600 };
  }
  if (/^\/api\/documents\/[^/]+\/analyze$/.test(path)) {
    return { key: "document.analyze", limit: 10, windowSeconds: 3600 };
  }
  if (/^\/api\/(projects\/[^/]+|initiatives\/[^/]+)\/documents$/.test(path)) {
    return { key: "document.upload", limit: 20, windowSeconds: 3600 };
  }
  if (/^\/api\/initiatives\/[^/]+\/(ai-assist(?:\/.*)?|analyze-intake)$/.test(path)) {
    return { key: "ai.request", limit: 30, windowSeconds: 3600 };
  }
  if (/^\/api\/initiatives\/[^/]+\/(generate|recalculate|methodology)$/.test(path)) {
    return { key: "plan.regenerate", limit: 20, windowSeconds: 3600 };
  }
  if (/^\/api\/(initiatives\/[^/]+\/sync\/jira|integrations\/[^/]+)$/.test(path)) {
    return { key: "integration.sync", limit: 30, windowSeconds: 600 };
  }
  if (path.startsWith("/api/admin/")) {
    return { key: "admin.mutation", limit: 60, windowSeconds: 600 };
  }
  return null;
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function hashRateLimitClient(request: Request): string {
  const material = `${process.env.RATE_LIMIT_SALT ?? "guided-planning-rate-limit-v1"}:${clientAddress(request)}`;
  return createHash("sha256").update(material).digest("hex");
}

export async function checkRateLimit(request: Request, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const rows = await rawDb.$queryRaw<Array<{
    allowed: boolean;
    remaining: number;
    retry_after_seconds: number;
  }>>`
    SELECT allowed, remaining, retry_after_seconds
    FROM app_private.check_rate_limit(
      ${policy.key},
      ${hashRateLimitClient(request)},
      ${policy.windowSeconds},
      ${policy.limit}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Rate limit check returned no result");
  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: row.retry_after_seconds,
  };
}
