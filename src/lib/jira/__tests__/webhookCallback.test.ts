import { afterEach, describe, expect, it, vi } from "vitest";
import { jiraWebhookCallbackUrl } from "../webhooks";

afterEach(() => vi.unstubAllEnvs());

describe("Jira webhook callback URL", () => {
  it("includes the Vercel bypass for protected Preview callbacks", () => {
    vi.stubEnv("JIRA_WEBHOOK_BASE_URL", "https://clarivia-preview.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-bypass");
    const callback = new URL(jiraWebhookCallbackUrl("connection-1", "jira-secret"));
    expect(callback.pathname).toBe("/api/integrations/jira/webhooks/connection-1");
    expect(callback.searchParams.get("token")).toBe("jira-secret");
    expect(callback.searchParams.get("x-vercel-protection-bypass")).toBe("test-bypass");
  });

  it("refuses a protected Preview callback with no bypass", () => {
    vi.stubEnv("JIRA_WEBHOOK_BASE_URL", "https://clarivia-preview.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
    expect(() => jiraWebhookCallbackUrl("connection-1", "jira-secret")).toThrow(/automation bypass/);
  });

  it("keeps public production callbacks free of a Vercel bypass", () => {
    vi.stubEnv("JIRA_WEBHOOK_BASE_URL", "https://clarivia.example.com");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-bypass");
    const callback = new URL(jiraWebhookCallbackUrl("connection-1", "jira-secret"));
    expect(callback.searchParams.get("token")).toBe("jira-secret");
    expect(callback.searchParams.has("x-vercel-protection-bypass")).toBe(false);
  });
});
