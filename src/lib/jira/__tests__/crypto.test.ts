import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptJiraSecret, encryptJiraSecret, equalHash, jiraHash } from "../crypto";

const originalKey = process.env.JIRA_TOKEN_ENCRYPTION_KEY;
beforeEach(() => { process.env.JIRA_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
afterEach(() => { if (originalKey === undefined) delete process.env.JIRA_TOKEN_ENCRYPTION_KEY; else process.env.JIRA_TOKEN_ENCRYPTION_KEY = originalKey; });

describe("Jira credential protection", () => {
  it("round-trips AES-GCM ciphertext without persisting the secret", () => {
    const ciphertext = encryptJiraSecret("rotating-refresh-token");
    expect(ciphertext).not.toContain("rotating-refresh-token");
    expect(decryptJiraSecret(ciphertext)).toBe("rotating-refresh-token");
  });
  it("rejects tampered ciphertext and compares state hashes safely", () => {
    const ciphertext = encryptJiraSecret("access-token");
    expect(() => decryptJiraSecret(`${ciphertext.slice(0, -2)}aa`)).toThrow();
    expect(equalHash(jiraHash("state"), jiraHash("state"))).toBe(true);
    expect(equalHash(jiraHash("state"), jiraHash("other"))).toBe(false);
  });
});
