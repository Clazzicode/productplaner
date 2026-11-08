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
    expect(rateLimitPolicyFor(request("/api/atlassian/forge/installation"))?.key).toBe("atlassian.forge_remote");
    expect(rateLimitPolicyFor(request("/api/atlassian/oauth/start"))?.key).toBe("atlassian.oauth_start");
    expect(rateLimitPolicyFor(request("/api/atlassian/oauth/disconnect", "DELETE"))?.key).toBe("atlassian.oauth_disconnect");
    expect(rateLimitPolicyFor(request("/api/atlassian/oauth/verify"))?.key).toBe("atlassian.oauth_verify");
    expect(rateLimitPolicyFor(request("/api/account/start-over"))?.key).toBe("account.start_over");
    expect(rateLimitPolicyFor(request("/api/workspace-invitations"))?.key).toBe("workspace.invitation.create");
    expect(rateLimitPolicyFor(request("/api/workspace-invitations/accept"))?.key).toBe("workspace.invitation.accept");
  });

  it("limits every sensitive Jira integration operation", () => {
    expect(rateLimitPolicyFor(request("/api/integrations/jira/oauth/start"))?.key).toBe("jira.oauth_start");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/oauth/callback", "GET"))?.key).toBe("jira.oauth_callback");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/imports"))?.key).toBe("jira.transfer");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/imports/run-1", "PATCH"))?.key).toBe("jira.transfer");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/exports/run-1/execute"))?.key).toBe("jira.transfer");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/jobs/job-1", "PATCH"))?.key).toBe("jira.job_control");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/connections/connection-1/webhooks"))?.key).toBe("jira.webhook_management");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/connections/connection-1", "DELETE"))?.key).toBe("jira.disconnect");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/conflicts/conflict-1", "PATCH"))?.key).toBe("jira.conflict_resolution");
    expect(rateLimitPolicyFor(request("/api/integrations/jira/webhooks/connection-1"))?.key).toBe("jira.webhook_delivery");
  });

  it("does not throttle reads or ordinary planning edits", () => {
    expect(rateLimitPolicyFor(request("/api/auth/sign-in", "GET"))).toBeNull();
    expect(rateLimitPolicyFor(request("/api/integrations/jira/imports/run-1", "GET"))).toBeNull();
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
