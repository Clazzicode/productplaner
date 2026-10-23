import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const ATLASSIAN_OAUTH_SCOPES = ["read:jira-work", "offline_access"] as const;
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

export class AtlassianOAuthError extends Error {
  constructor(readonly code: string) {
    super("Atlassian connection could not be completed.");
    this.name = "AtlassianOAuthError";
  }
}

export function atlassianOAuthConfig() {
  const clientId = process.env.ATLASSIAN_CLIENT_ID?.trim();
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = process.env.ATLASSIAN_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new AtlassianOAuthError("OAUTH_NOT_CONFIGURED");
  let redirect: URL;
  try { redirect = new URL(redirectUri); }
  catch { throw new AtlassianOAuthError("OAUTH_NOT_CONFIGURED"); }
  const localHttp = redirect.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirect.hostname);
  if ((!localHttp && redirect.protocol !== "https:") || redirect.username || redirect.password
      || redirect.pathname !== "/api/atlassian/oauth/callback" || redirect.search || redirect.hash) {
    throw new AtlassianOAuthError("OAUTH_NOT_CONFIGURED");
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

export function buildAtlassianAuthorizationUrl(state: string): string {
  const config = atlassianOAuthConfig();
  const url = new URL("https://auth.atlassian.com/authorize");
  url.search = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: config.clientId,
    scope: ATLASSIAN_OAUTH_SCOPES.join(" "),
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  refresh_token: z.string().min(1).max(16_384),
  expires_in: z.number().int().positive().max(86_400),
  scope: z.string().min(1).max(8_000),
}).passthrough();

const resourcesSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  url: z.string().url().max(2_000),
  scopes: z.array(z.string().max(200)).max(200),
}).passthrough()).max(100);
const encryptedTokensSchema = z.object({
  accessToken: z.string().min(1).max(16_384),
  refreshToken: z.string().min(1).max(16_384),
  expiresIn: z.number().int().positive().max(86_400),
  scopes: z.array(z.string().min(1).max(200)).max(100),
}).strict();

export type AtlassianResource = z.infer<typeof resourcesSchema>[number];
export type AtlassianTokens = { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] };

function safeToken(value: string): boolean {
  return value.length <= 16_384 && !/[\s\u0000-\u001f]/.test(value);
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new AtlassianOAuthError("OAUTH_NETWORK_FAILURE");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AtlassianOAuthError(response.status === 429 || response.status >= 500
      ? "OAUTH_PROVIDER_TEMPORARY"
      : "OAUTH_PROVIDER_REJECTED");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > 256_000) {
    await response.body?.cancel();
    throw new AtlassianOAuthError("OAUTH_RESPONSE_INVALID");
  }
  try {
    const text = await response.text();
    if (text.length > 256_000) throw new Error("too large");
    return JSON.parse(text) as unknown;
  } catch {
    throw new AtlassianOAuthError("OAUTH_RESPONSE_INVALID");
  }
}

export async function exchangeAtlassianCode(code: string): Promise<AtlassianTokens> {
  if (!safeToken(code)) throw new AtlassianOAuthError("OAUTH_CODE_INVALID");
  const config = atlassianOAuthConfig();
  const raw = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success || !safeToken(parsed.data.access_token) || !safeToken(parsed.data.refresh_token)) {
    throw new AtlassianOAuthError("OAUTH_RESPONSE_INVALID");
  }
  const scopes = [...new Set(parsed.data.scope.split(/\s+/).filter(Boolean))].sort();
  if (!ATLASSIAN_OAUTH_SCOPES.every((scope) => scopes.includes(scope))) {
    throw new AtlassianOAuthError("OAUTH_SCOPE_MISMATCH");
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresIn: parsed.data.expires_in,
    scopes,
  };
}

export async function getAtlassianAccessibleResources(accessToken: string): Promise<AtlassianResource[]> {
  if (!safeToken(accessToken)) throw new AtlassianOAuthError("OAUTH_TOKEN_INVALID");
  const raw = await fetchJson(RESOURCES_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const parsed = resourcesSchema.safeParse(raw);
  if (!parsed.success) throw new AtlassianOAuthError("OAUTH_RESOURCES_INVALID");
  return parsed.data.map((resource) => {
    const url = new URL(resource.url);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new AtlassianOAuthError("OAUTH_RESOURCES_INVALID");
    }
    return { ...resource, url: url.origin };
  });
}

function encryptionKey(): Buffer {
  const encoded = process.env.ATLASSIAN_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new AtlassianOAuthError("TOKEN_ENCRYPTION_NOT_CONFIGURED");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new AtlassianOAuthError("TOKEN_ENCRYPTION_NOT_CONFIGURED");
  return key;
}

export function encryptAtlassianTokens(organizationId: string, tokens: AtlassianTokens): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`clarivia:atlassian:oauth:v1:${organizationId}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAtlassianTokens(organizationId: string, envelope: string): AtlassianTokens {
  try {
    const [version, nonceEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(".");
    if (version !== "v1" || !nonceEncoded || !tagEncoded || !ciphertextEncoded || extra !== undefined) throw new Error("invalid envelope");
    const nonce = Buffer.from(nonceEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length > 64_000) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), nonce);
    decipher.setAAD(Buffer.from(`clarivia:atlassian:oauth:v1:${organizationId}`, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = encryptedTokensSchema.safeParse(JSON.parse(plaintext));
    if (!parsed.success) throw new Error("invalid payload");
    return parsed.data;
  } catch {
    throw new AtlassianOAuthError("TOKEN_DECRYPTION_FAILED");
  }
}

export async function refreshAtlassianTokens(refreshToken: string): Promise<AtlassianTokens> {
  if (!safeToken(refreshToken)) throw new AtlassianOAuthError("OAUTH_TOKEN_INVALID");
  const config = atlassianOAuthConfig();
  const raw = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success || !safeToken(parsed.data.access_token) || !safeToken(parsed.data.refresh_token)) {
    throw new AtlassianOAuthError("OAUTH_REFRESH_REQUIRED");
  }
  const scopes = [...new Set(parsed.data.scope.split(/\s+/).filter(Boolean))].sort();
  if (!ATLASSIAN_OAUTH_SCOPES.every((scope) => scopes.includes(scope))) throw new AtlassianOAuthError("OAUTH_SCOPE_MISMATCH");
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token, expiresIn: parsed.data.expires_in, scopes };
}

export function newOAuthState(): { state: string; stateHash: string } {
  const state = randomBytes(32).toString("base64url");
  return { state, stateHash: createHash("sha256").update(state).digest("hex") };
}
