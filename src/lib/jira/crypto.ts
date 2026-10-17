import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const AAD = Buffer.from("guided-planning:jira-token:v1", "utf8");

function encryptionKey() {
  const configured = process.env.JIRA_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("JIRA_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = /^[a-f\d]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("JIRA_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptJiraSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptJiraSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue, ...extra] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra.length) throw new Error("Invalid encrypted Jira credential.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}

export const jiraHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function equalHash(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
