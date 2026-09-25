import { describe, expect, it } from "vitest";
import { hashRateLimitClient, rateLimitPolicyFor } from "../rateLimit";

function request(path: string, method = "POST", ip = "203.0.113.4") {
  return new Request(`https://planning.example${path}`, { method, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
}

describe("rateLimitPolicyFor", () => {
  it("limits authentication, AI, uploads, sync, and destructive account operations", () => {
    expect(rateLimitPolicyFor(request("/api/auth/sign-in"))?.key).toBe("auth.sign_in");
    expect(rateLimitPolicyFor(request("/api/initiatives/i1/ai-assist/features"))?.key).toBe("ai.request");
    expect(rateLimitPolicyFor(request("/api/documents/d1/analyze"))?.key).toBe("document.analyze");
    expect(rateLimitPolicyFor(request("/api/initiatives/i1/sync/jira"))?.key).toBe("integration.sync");
    expect(rateLimitPolicyFor(request("/api/account/start-over"))?.key).toBe("account.start_over");
  });

  it("does not throttle reads or ordinary planning edits", () => {
    expect(rateLimitPolicyFor(request("/api/auth/sign-in", "GET"))).toBeNull();
    expect(rateLimitPolicyFor(request("/api/capabilities/c1", "PATCH"))).toBeNull();
  });
});
describe("hashRateLimitClient", () => {
  it("is stable, pseudonymous, and separates client addresses", () => {
    const first = hashRateLimitClient(request("/api/auth/sign-in", "POST", "203.0.113.4"));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRateLimitClient(request("/api/auth/sign-in", "POST", "203.0.113.4"))).toBe(first);
    expect(hashRateLimitClient(request("/api/auth/sign-in", "POST", "203.0.113.5"))).not.toBe(first);
  });
});
