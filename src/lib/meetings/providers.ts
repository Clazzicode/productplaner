import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

export type MeetingProvider = "google_calendar" | "zoom";
export const isMeetingProvider = (value: string): value is MeetingProvider => value === "google_calendar" || value === "zoom";

const tokenSchema = z.object({
  accessToken: z.string().min(1).max(16384),
  refreshToken: z.string().min(1).max(16384),
}).strict();
type Tokens = z.infer<typeof tokenSchema>;

function encryptionKey(): Buffer {
  const encoded = process.env.MEETING_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error("Meeting token encryption is not configured.");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("Meeting token encryption is not configured.");
  return key;
}

export function encryptTokens(organizationId: string, userId: string, provider: MeetingProvider | "notion", tokens: Tokens): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`clarivia:meeting:v1:${organizationId}:${userId}:${provider}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTokens(organizationId: string, userId: string, provider: MeetingProvider | "notion", envelope: string): Tokens {
  const [version, nonce, tag, ciphertext, extra] = envelope.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext || extra !== undefined) throw new Error("Meeting connection needs to be reauthorized.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(`clarivia:meeting:v1:${organizationId}:${userId}:${provider}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return tokenSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")));
  } catch {
    throw new Error("Meeting connection needs to be reauthorized.");
  }
}

export function providerConfig(provider: MeetingProvider) {
  const prefix = provider === "google_calendar" ? "GOOGLE_MEETING" : "ZOOM_MEETING";
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`]?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error(`${provider === "zoom" ? "Zoom" : "Google Calendar"} OAuth is not configured for this deployment.`);
  const parsed = new URL(redirectUri);
  const local = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if ((!local && parsed.protocol !== "https:") || parsed.pathname !== `/api/meeting-providers/${provider}/callback` || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("Meeting OAuth redirect URI is invalid.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function authorizationUrl(provider: MeetingProvider, state: string): string {
  const config = providerConfig(provider);
  const url = new URL(provider === "google_calendar" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://zoom.us/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (provider === "google_calendar") {
    url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  if (provider === "zoom") url.searchParams.set("scope", "meeting:write:meeting meeting:read:past_meeting meeting:read:list_past_participants cloud_recording:read:meeting_transcript user:read:user");
  return url.toString();
}

async function tokenRequest(provider: MeetingProvider, form: URLSearchParams): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; scopes: string[] }> {
  const config = providerConfig(provider);
  const headers: HeadersInit = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (provider === "zoom") headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  else { form.set("client_id", config.clientId); form.set("client_secret", config.clientSecret); }
  const response = await fetch(provider === "zoom" ? "https://zoom.us/oauth/token" : "https://oauth2.googleapis.com/token", {
    method: "POST", headers, body: form, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("The meeting provider rejected authorization. Please reconnect.");
  const raw = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().int().positive(), scope: z.string().optional() }).parse(await response.json());
  return { accessToken: raw.access_token, refreshToken: raw.refresh_token, expiresIn: raw.expires_in, scopes: raw.scope?.split(/\s+/).filter(Boolean) ?? [] };
}

export async function exchangeCode(provider: MeetingProvider, code: string): Promise<{ tokens: Tokens; expiresAt: number }> {
  if (!code || code.length > 16384) throw new Error("Invalid authorization code.");
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: providerConfig(provider).redirectUri });
  const result = await tokenRequest(provider, form);
  if (!result.refreshToken) throw new Error("The provider did not grant offline access. Please reconnect.");
  const required = provider === "google_calendar"
    ? ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/meetings.space.readonly"]
    : ["meeting:write:meeting", "meeting:read:past_meeting", "meeting:read:list_past_participants", "cloud_recording:read:meeting_transcript", "user:read:user"];
  if (!required.every((scope) => result.scopes.includes(scope))) throw new Error("The provider did not grant the required meeting permissions.");
  return { tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken }, expiresAt: Date.now() + result.expiresIn * 1000 };
}

export async function providerAccountEmail(provider: MeetingProvider, accessToken: string): Promise<string> {
  const url = provider === "google_calendar" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://api.zoom.us/v2/users/me";
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Could not identify the connected account.");
  const account = z.object({ email: z.email(), email_verified: z.boolean().optional() }).passthrough().parse(await response.json());
  if (provider === "google_calendar" && account.email_verified !== true) throw new Error("The Google account email is not verified.");
  return account.email;
}

export async function connectedAccount(organizationId: string, userId: string, provider: MeetingProvider) {
  return db.personalIntegrationConnection.findUnique({ where: { organizationId_userId_provider: { organizationId, userId, provider } } });
}

export async function accessTokenFor(organizationId: string, userId: string, provider: MeetingProvider): Promise<string> {
  const connection = await connectedAccount(organizationId, userId, provider);
  if (!connection) throw new Error(`${provider === "zoom" ? "Zoom" : "Google Calendar"} is not connected.`);
  const tokens = decryptTokens(organizationId, userId, provider, connection.tokenCiphertext);
  if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return tokens.accessToken;
  const refreshed = await tokenRequest(provider, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }));
  const nextTokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
  await db.personalIntegrationConnection.update({ where: { id: connection.id }, data: { tokenCiphertext: encryptTokens(organizationId, userId, provider, nextTokens), accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000) } });
  return nextTokens.accessToken;
}
