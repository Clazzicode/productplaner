import { describe, expect, it } from "vitest";
import { bearerToken, ForgeAuthenticationError, normalizeVerifiedForgeClaims } from "../forgeAuth";

const appId = "ari:cloud:ecosystem::app/example";

describe("Forge Invocation Token boundary", () => {
  it("requires a strict bearer token", () => {
    expect(() => bearerToken(new Request("https://example.test"))).toThrow(ForgeAuthenticationError);
    expect(bearerToken(new Request("https://example.test", {
      headers: { authorization: "Bearer signed.jwt.value" },
    }))).toBe("signed.jwt.value");
  });

  it("normalizes a verified commercial Forge installation", () => {
    const result = normalizeVerifiedForgeClaims({
      iss: "forge/invocation-token",
      exp: 2_000_000_000,
      app: {
        id: appId,
        installation: {
          id: "ari:cloud:ecosystem::installation/test",
          contexts: [{ cloudId: "cloud-1", apiBaseUrl: "https://api.atlassian.com/ex/jira/cloud-1" }],
        },
      },
      context: { cloudId: "cloud-1" },
    }, appId);
    expect(result).toMatchObject({
      installationId: "ari:cloud:ecosystem::installation/test",
      cloudId: "cloud-1",
      apiBaseUrl: "https://api.atlassian.com/ex/jira/cloud-1",
    });
  });

  it("rejects an unexpected app, host, missing expiry, or unconfigured isolated cloud", () => {
    const base = {
      iss: "forge/invocation-token",
      exp: 2_000_000_000,
      app: { id: appId, installationId: "install-1", apiBaseUrl: "https://api.atlassian.com/ex/jira/cloud-1" },
    };
    expect(() => normalizeVerifiedForgeClaims({ ...base, app: { ...base.app, id: "other" } }, appId)).toThrow();
    expect(() => normalizeVerifiedForgeClaims({ ...base, app: { ...base.app, apiBaseUrl: "https://attacker.example" } }, appId)).toThrow();
    expect(() => normalizeVerifiedForgeClaims({ ...base, exp: undefined }, appId)).toThrow();
    expect(() => normalizeVerifiedForgeClaims({ ...base, icLabel: "restricted" }, appId)).toThrow();
  });
});
