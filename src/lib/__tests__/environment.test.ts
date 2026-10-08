import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertEnvironmentIsolation, environmentIsolation } from "../environment";

const production = "hzsrdpbdbfqaicropsha";
const staging = "stagingproject";
const direct = (ref: string) => `postgresql://app_rw:secret@db.${ref}.supabase.co:5432/postgres`;
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", "preview");
  vi.stubEnv("APP_ENVIRONMENT", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${staging}.supabase.co`);
  vi.stubEnv("DATABASE_URL", direct(staging));
  vi.stubEnv("DIRECT_URL", direct(staging));
});
afterEach(() => vi.unstubAllEnvs());

describe("environmentIsolation", () => {
  it("accepts matching staging Auth and direct database connections", () => {
    expect(environmentIsolation()).toMatchObject({ isolated: true, databaseProjectRef: staging });
  });
  it("accepts a pooler connection and decodes its username", () => {
    vi.stubEnv("DATABASE_URL", `postgresql://app_rw%2E${staging}:secret@aws-1-us-west-2.pooler.supabase.com:6543/postgres`);
    expect(environmentIsolation().isolated).toBe(true);
  });
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL"])("blocks production through %s", (key) => {
    vi.stubEnv(key, key === "NEXT_PUBLIC_SUPABASE_URL" ? `https://${production}.supabase.co` : direct(production));
    vi.stubEnv("ENFORCE_ENVIRONMENT_ISOLATION", "false");
    expect(() => assertEnvironmentIsolation()).toThrow("production Supabase");
  });
  it("blocks a production pooler even when Auth points at staging", () => {
    vi.stubEnv("DATABASE_URL", `postgresql://app_rw.${production}:secret@aws-1-us-west-2.pooler.supabase.com:6543/postgres`);
    expect(environmentIsolation().isolated).toBe(false);
  });
  it.each(["", "not-a-url", "postgresql://user:secret@localhost/test", "postgresql://app_rw.stagingproject:secret@pooler.supabase.com.evil.test/db"])("fails closed on an unverified database URL: %s", (value) => {
    vi.stubEnv("DATABASE_URL", value);
    expect(environmentIsolation().isolated).toBe(false);
  });
  it("rejects mixed staging projects", () => {
    vi.stubEnv("DIRECT_URL", direct("otherstaging"));
    expect(environmentIsolation().reason).toContain("different Supabase projects");
  });
  it.each(["staging", "test"])("enforces explicit %s even with Vercel production", (environment) => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("APP_ENVIRONMENT", environment);
    vi.stubEnv("DATABASE_URL", direct(production));
    expect(environmentIsolation().isolated).toBe(false);
  });
  it.each(["production", "development"])("keeps %s usable", (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("VERCEL_TARGET_ENV", environment);
    vi.stubEnv("DATABASE_URL", direct(production));
    expect(environmentIsolation().isolated).toBe(true);
  });
});
