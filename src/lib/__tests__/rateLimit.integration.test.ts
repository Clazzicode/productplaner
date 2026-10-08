import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { rawDb } from "../db";
import { checkRateLimit } from "../rateLimit";

afterAll(async () => { await rawDb.$disconnect(); });

// Exercise Prisma's real parameter binding, which mocked queries and SQL
// literals miss. Uses an isolated diagnostic bucket that expires normally.
it("accepts Prisma numeric parameters and enforces the database limit", async () => {
  const request = new Request("https://planning.example/api/auth/sign-in");
  const policy = { key: `test.auth.${randomUUID()}`, windowSeconds: 86400, limit: 1 };

  const first = await checkRateLimit(request, policy);
  expect(first).toMatchObject({ allowed: true, remaining: 0 });
  expect(first.retryAfterSeconds).toBeGreaterThan(0);

  const second = await checkRateLimit(request, policy);
  expect(second).toMatchObject({ allowed: false, remaining: 0 });
  expect(second.retryAfterSeconds).toBeGreaterThan(0);
}, 20_000);
