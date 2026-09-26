import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rateLimit: vi.fn(), query: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.rateLimit, rateLimitPolicyFor: () => ({ key: "test" }) }));
vi.mock("@/lib/db", () => ({ rawDb: { $queryRaw: mocks.query } }));
import { withApi } from "../observability";
import { updateSupabaseSession } from "../supabase/middleware";
import { createSupabaseServerClient, createSupabaseServiceClient } from "../supabase/server";
import { GET as ready } from "@/app/api/ready/route";
import { GET as health } from "@/app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hzsrdpbdbfqaicropsha.supabase.co");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("environment enforcement at execution boundaries", () => {
  it("rejects an API mutation before its rate-limit query or handler runs", async () => {
    const handler = vi.fn();
    const response = await withApi(handler)(new Request("https://preview.example/api/auth/sign-in", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it("blocks middleware before refreshing a production session", async () => {
    const response = await updateSupabaseSession(new NextRequest("https://preview.example/login"));
    expect(response.status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("blocks both server client factories before contacting Supabase", async () => {
    await expect(createSupabaseServerClient()).rejects.toThrow("production Supabase");
    expect(() => createSupabaseServiceClient()).toThrow("production Supabase");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("keeps liveness available and readiness unavailable without touching production", async () => {
    expect((await health()).status).toBe(200);
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { environmentIsolation: "failed" } });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
