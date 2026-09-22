import { afterEach, describe, expect, it } from "vitest";
import { environmentIsolation } from "../environment";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe("environmentIsolation", () => {
  it("rejects a preview deployment pointed at production Supabase", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hzsrdpbdbfqaicropsha.supabase.co";
    expect(environmentIsolation()).toMatchObject({ isolated: false, databaseProjectRef: "hzsrdpbdbfqaicropsha" });
  });

  it("accepts production and isolated preview databases", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hzsrdpbdbfqaicropsha.supabase.co";
    expect(environmentIsolation().isolated).toBe(true);
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stagingref.supabase.co";
    expect(environmentIsolation().isolated).toBe(true);
  });
});
