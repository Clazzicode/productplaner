import { describe, expect, it, vi } from "vitest";

const completeJiraOAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/entryPoints", () => ({ withAuthenticatedApi: (handler: unknown) => handler }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentUserApi: async () => ({ ok: true, user: { id: "user-a", authUserId: "auth-a", organizationId: "org-a" } }) }));
vi.mock("@/lib/db", () => ({ establishAuthContext: vi.fn() }));
vi.mock("@/lib/jira/oauth", () => ({ completeJiraOAuth }));

import { GET } from "@/app/api/integrations/jira/oauth/callback/route";

describe("Jira OAuth cancellation", () => {
  it("returns to Clarivia with a cancelled outcome when Atlassian redirects a denial", async () => {
    const response = await GET(new Request("https://clarivia.example/api/integrations/jira/oauth/callback?error=access_denied&state=test-state"));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/integrations/jira");
    expect(location.searchParams.get("jira")).toBe("cancelled");
    expect(completeJiraOAuth).not.toHaveBeenCalled();
  });
});
