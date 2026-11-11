import { describe, expect, it } from "vitest";
import { prismaDatabaseUrl } from "@/lib/dbConnection";

describe("serverless database connection limit", () => {
  const staging = "postgresql://app_rw.project:encoded%40password@pooler.example:5432/postgres?pgbouncer=true";

  it("limits each Vercel Prisma instance while preserving its credentials and pooler settings", () => {
    const result = new URL(prismaDatabaseUrl(staging, "preview")!);
    expect(result.username).toBe("app_rw.project");
    expect(result.password).toBe("encoded%40password");
    expect(result.port).toBe("5432");
    expect(result.searchParams.get("pgbouncer")).toBe("true");
    expect(result.searchParams.get("connection_limit")).toBe("1");
  });

  it("caps an older explicit pool size on Vercel and leaves local URLs alone", () => {
    const explicit = `${staging}&connection_limit=10`;
    expect(new URL(prismaDatabaseUrl(explicit, "production")!).searchParams.get("connection_limit")).toBe("1");
    expect(prismaDatabaseUrl(explicit, undefined)).toBe(explicit);
    expect(prismaDatabaseUrl(staging, undefined)).toBe(staging);
  });
});
