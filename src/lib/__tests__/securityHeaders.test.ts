import { describe, expect, it } from "vitest";
import { applySecurityResponseHeaders, buildContentSecurityPolicy } from "../securityHeaders";

describe("security response headers", () => {
  it("builds a production CSP around the per-request nonce", () => {
    const policy = buildContentSecurityPolicy("nonce-value", false);
    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows the development transports without weakening production", () => {
    const policy = buildContentSecurityPolicy("dev-nonce", true);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain(" ws: http:");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("adds the invariant browser defenses", () => {
    const response = new Response();
    applySecurityResponseHeaders(response, "default-src 'self'");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
  });
});

