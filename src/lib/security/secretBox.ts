import crypto from "crypto";

// Encrypts small secrets (per-user API keys) at rest. AES-256-GCM: a random
// 12-byte IV per call plus an auth tag, so identical plaintexts never produce
// identical ciphertexts and tampering is detected on decrypt rather than
// silently accepted.
const ALGORITHM = "aes-256-gcm";

function loadKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured on this server.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

/** Returns `iv.authTag.ciphertext`, each base64 — safe to store as one text column. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [ivB64, authTagB64, ciphertextB64] = blob.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed secret blob.");
  const decipher = crypto.createDecipheriv(ALGORITHM, loadKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
