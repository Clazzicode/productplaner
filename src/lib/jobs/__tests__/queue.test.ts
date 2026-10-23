import { describe, expect, it } from "vitest";
import { idempotencyKeyFromRequest, retryDelaySeconds } from "../queue";
import { isAuthorizedWorkerRequest } from "../workerAuth";

describe("background job reliability helpers", () => {
  it("uses bounded exponential retry delays", () => {
    expect(retryDelaySeconds(1)).toBe(5);
    expect(retryDelaySeconds(2)).toBe(10);
    expect(retryDelaySeconds(20)).toBe(3600);
  });

  it("accepts a configured bearer or worker secret", () => {
    const bearer = new Request("https://example.test/internal", { headers: { authorization: "Bearer correct-secret" } });
    const header = new Request("https://example.test/internal", { headers: { "x-worker-secret": "correct-secret" } });
    expect(isAuthorizedWorkerRequest(bearer, ["correct-secret"])).toBe(true);
    expect(isAuthorizedWorkerRequest(header, ["correct-secret"])).toBe(true);
  });

  it("fails closed when the secret is absent or incorrect", () => {
    const missing = new Request("https://example.test/internal");
    const wrong = new Request("https://example.test/internal", { headers: { authorization: "Bearer wrong" } });
    expect(isAuthorizedWorkerRequest(missing, ["correct-secret"])).toBe(false);
    expect(isAuthorizedWorkerRequest(wrong, ["correct-secret"])).toBe(false);
    expect(isAuthorizedWorkerRequest(wrong, [undefined])).toBe(false);
  });

  it("uses a valid caller idempotency key and rejects unsafe values", () => {
    const valid = new Request("https://example.test", { headers: { "idempotency-key": "plan:request-123" } });
    const unsafe = new Request("https://example.test", { headers: { "idempotency-key": "spaces are not accepted" } });
    expect(idempotencyKeyFromRequest(valid)).toBe("plan:request-123");
    expect(idempotencyKeyFromRequest(unsafe)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

