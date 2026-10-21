import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

const ATLASSIAN_FORGE_JWKS = new URL(
  "https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json",
);
const remoteJwks = createRemoteJWKSet(ATLASSIAN_FORGE_JWKS);

const contextSchema = z.object({
  cloudId: z.string().min(1).optional(),
  apiBaseUrl: z.string().url().optional(),
}).passthrough();

const forgeClaimsSchema = z.object({
  iss: z.literal("forge/invocation-token"),
  exp: z.number().int().positive(),
  icLabel: z.string().optional(),
  app: z.object({
    id: z.string().min(1),
    installationId: z.string().min(1).optional(),
    apiBaseUrl: z.string().url().optional(),
    installation: z.object({
      id: z.string().min(1),
      contexts: z.array(contextSchema).default([]),
    }).optional(),
  }).passthrough(),
  context: contextSchema.optional(),
}).passthrough();

export class ForgeAuthenticationError extends Error {
  constructor(message = "Invalid Forge invocation.") {
    super(message);
    this.name = "ForgeAuthenticationError";
  }
}

export type VerifiedForgeInvocation = {
  installationId: string;
  appId: string;
  cloudId: string | null;
  apiBaseUrl: string;
  expiresAt: Date;
};

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw new ForgeAuthenticationError();
  return match[1];
}

export function normalizeVerifiedForgeClaims(
  payload: JWTPayload,
  expectedAppId: string,
): VerifiedForgeInvocation {
  const parsed = forgeClaimsSchema.safeParse(payload);
  if (!parsed.success) throw new ForgeAuthenticationError();

  // Isolated Cloud uses a different JWKS URL supplied during Atlassian
  // onboarding. Failing closed is safer than sending data to a commercial
  // endpoint or constructing a JWKS URL from an untrusted claim.
  if (parsed.data.icLabel) {
    throw new ForgeAuthenticationError("Isolated Cloud is not configured.");
  }
  if (parsed.data.app.id && parsed.data.app.id !== expectedAppId) {
    throw new ForgeAuthenticationError();
  }

  const installationId = parsed.data.app.installationId
    ?? parsed.data.app.installation?.id;
  const matchingContext = parsed.data.app.installation?.contexts.find(
    (entry) => entry.cloudId === parsed.data.context?.cloudId,
  ) ?? parsed.data.app.installation?.contexts[0];
  const apiBaseUrl = parsed.data.app.apiBaseUrl
    ?? parsed.data.context?.apiBaseUrl
    ?? matchingContext?.apiBaseUrl;
  const cloudId = parsed.data.context?.cloudId ?? matchingContext?.cloudId ?? null;

  if (!installationId || !apiBaseUrl) throw new ForgeAuthenticationError();
  const url = new URL(apiBaseUrl);
  if (url.protocol !== "https:" || !["api.atlassian.com", "api.stg.atlassian.com"].includes(url.hostname)) {
    throw new ForgeAuthenticationError();
  }

  return {
    installationId,
    appId: expectedAppId,
    cloudId,
    apiBaseUrl: url.toString().replace(/\/$/, ""),
    expiresAt: new Date(parsed.data.exp * 1000),
  };
}

export async function verifyForgeInvocation(request: Request): Promise<VerifiedForgeInvocation> {
  const appId = process.env.FORGE_APP_ID?.trim();
  if (!appId) throw new Error("FORGE_APP_ID is not configured.");
  try {
    const verified = await jwtVerify(bearerToken(request), remoteJwks, {
      audience: appId,
      issuer: "forge/invocation-token",
      algorithms: ["RS256"],
    });
    return normalizeVerifiedForgeClaims(verified.payload, appId);
  } catch (error) {
    if (error instanceof ForgeAuthenticationError) throw error;
    throw new ForgeAuthenticationError();
  }
}
