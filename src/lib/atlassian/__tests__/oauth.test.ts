import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATLASSIAN_OAUTH_SCOPES,
  AtlassianOAuthError,
  buildAtlassianAuthorizationUrl,
  decryptAtlassianTokens,
  encryptAtlassianTokens,
  exchangeAtlassianCode,
  getAtlassianAccessibleResources,
  newOAuthState,
} from "../oauth";

const originalEnv = {
  clientId: process.env.ATLASSIAN_CLIENT_ID,
  clientSecret: process.env.ATLASSIAN_CLIENT_SECRET,
  redirectUri: process.env.ATLASSIAN_OAUTH_REDIRECT_URI,
  encryptionKey: process.env.ATLASSIAN_TOKEN_ENCRYPTION_KEY,
};

afterEach(() => {
  vi.restoreAllMocks();
  process.env.ATLASSIAN_CLIENT_ID = originalEnv.clientId;
  process.env.ATLASSIAN_CLIENT_SECRET = originalEnv.clientSecret;
  process.env.ATLASSIAN_OAUTH_REDIRECT_URI = originalEnv.redirectUri;
  process.env.ATLASSIAN_TOKEN_ENCRYPTION_KEY = originalEnv.encryptionKey;
});

function configureOAuth() {
  process.env.ATLASSIAN_CLIENT_ID = "clarivia-client";
  process.env.ATLASSIAN_CLIENT_SECRET = "test-client-secret";
  process.env.ATLASSIAN_OAUTH_REDIRECT_URI = "https://clarivia.example/api/atlassian/oauth/callback";
}

describe("Atlassian OAuth 3LO security boundary", () => {
  it("uses a high-entropy state and requests read-only Jira access plus refresh capability", () => {
    configureOAuth();
    const { state, stateHash } = newOAuthState();
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stateHash).toMatch(/^[a-f0-9]{64}$/);

    const url = new URL(buildAtlassianAuthorizationUrl(state));
    expect(url.origin).toBe("https://auth.atlassian.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([...ATLASSIAN_OAUTH_SCOPES].sort());
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.ATLASSIAN_OAUTH_REDIRECT_URI);
  });

  it("encrypts tokens with organization-bound AES-GCM and rejects tampering", () => {
    process.env.ATLASSIAN_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
    const tokens = {
      accessToken: "opaque-access-token",
      refreshToken: "opaque-refresh-token",
      expiresIn: 3600,
      scopes: ["offline_access", "read:jira-work"],
    };
    const envelope = encryptAtlassianTokens("workspace-a", tokens);
    expect(envelope).toMatch(/^v1\./);
    expect(envelope).not.toContain(tokens.accessToken);
    expect(envelope).not.toContain(tokens.refreshToken);
    expect(decryptAtlassianTokens("workspace-a", envelope)).toEqual(tokens);
    expect(() => decryptAtlassianTokens("workspace-b", envelope)).toThrow(AtlassianOAuthError);
    expect(() => decryptAtlassianTokens("workspace-a", `${envelope.slice(0, -1)}x`)).toThrow(AtlassianOAuthError);
  });

  it("exchanges codes only on Atlassian endpoints and refuses grants missing a required read scope", async () => {
    configureOAuth();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "read:jira-work offline_access",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const tokens = await exchangeAtlassianCode("authorization-code");
    expect(tokens.scopes).toEqual(["offline_access", "read:jira-work"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://auth.atlassian.com/oauth/token");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.redirect).toBe("error");
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.grant_type).toBe("authorization_code");
    expect(body.client_secret).toBe("test-client-secret");
    expect(JSON.stringify(body)).not.toMatch(/write:jira|manage:jira/);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "offline_access",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(exchangeAtlassianCode("another-code")).rejects.toThrow("Atlassian connection could not be completed.");
  });

  it("uses the fixed accessible-resources URL and validates Jira sites", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { id: "a5f30982-c0a3-4f15-99d8-2da64c6bc782", name: "Clarivia Jira", url: "https://clarivia.atlassian.net/path?x=1", scopes: ["read:jira-work"] },
    ]), { status: 200, headers: { "content-type": "application/json" } }));
    const resources = await getAtlassianAccessibleResources("short-lived-access-token");
    expect(resources[0]).toMatchObject({ url: "https://clarivia.atlassian.net" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.atlassian.com/oauth/token/accessible-resources");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer short-lived-access-token");
  });
});
