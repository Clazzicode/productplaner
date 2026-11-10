import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import { decryptTokens, encryptTokens } from "@/lib/meetings/providers";

export const NOTION_VERSION = "2026-03-11";

function config() {
  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Notion OAuth is not configured for this deployment.");
  const url = new URL(redirectUri);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.pathname !== "/api/notion/callback" || url.search || url.hash || url.username || url.password) throw new Error("Notion OAuth redirect URI is invalid.");
  return { clientId, clientSecret, redirectUri };
}

export function notionRedirectUri() { return config().redirectUri; }

export function notionAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = config();
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

async function notionTokenRequest(body: Record<string, string>) {
  const { clientId, clientSecret } = config();
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST", headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "content-type": "application/json", "Notion-Version": NOTION_VERSION },
    body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Notion rejected authorization. Please reconnect.");
  return z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), workspace_name: z.string().nullable().optional() }).passthrough().parse(await response.json());
}

export async function exchangeNotionCode(code: string) {
  if (!code || code.length > 16384) throw new Error("Invalid Notion authorization code.");
  return notionTokenRequest({ grant_type: "authorization_code", code, redirect_uri: config().redirectUri });
}

async function notionConnection(organizationId: string, userId: string) {
  const connection = await db.personalIntegrationConnection.findUnique({ where: { organizationId_userId_provider: { organizationId, userId, provider: "notion" } } });
  if (!connection) throw new Error("Notion is not connected.");
  return connection;
}

export async function notionAccessToken(organizationId: string, userId: string, refresh = false) {
  const connection = await notionConnection(organizationId, userId);
  const tokens = decryptTokens(organizationId, userId, "notion", connection.tokenCiphertext);
  if (!refresh) return tokens.accessToken;
  const renewed = await notionTokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  await db.personalIntegrationConnection.update({ where: { id: connection.id }, data: { tokenCiphertext: encryptTokens(organizationId, userId, "notion", { accessToken: renewed.access_token, refreshToken: renewed.refresh_token }) } });
  return renewed.access_token;
}

export function notionPageId(input: string): string {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) return trimmed;
  if (/^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(trimmed)) return trimmed.replaceAll("-", "");
  const url = new URL(trimmed);
  if (url.protocol !== "https:" || !["notion.so", "www.notion.so", "notion.site", "www.notion.site"].includes(url.hostname)) throw new Error("Enter a Notion page URL or page ID.");
  const match = url.pathname.match(/([0-9a-fA-F]{32})(?:\/|$)/);
  if (!match) throw new Error("The Notion page URL has no page ID.");
  return match[1];
}

async function notionGet(organizationId: string, userId: string, path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await notionAccessToken(organizationId, userId, attempt === 1);
    const response = await fetch(`https://api.notion.com/v1/${path}`, { headers: { authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) throw new Error(`Notion could not read this page (${response.status}). Share it with the Clarivia connection in Notion.`);
    return response.json() as Promise<unknown>;
  }
  throw new Error("Notion connection needs to be reauthorized.");
}

export async function importNotionPage(organizationId: string, userId: string, input: string): Promise<{ pageId: string; text: string }> {
  const pageId = notionPageId(input);
  const lines: string[] = [];
  const queue: { id: string; depth: number }[] = [{ id: pageId, depth: 0 }];
  while (queue.length && lines.length < 250) {
    const next = queue.shift()!;
    let cursor: string | null = null;
    for (let page = 0; page < 3 && lines.length < 250; page++) {
      const url = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
      const result = z.object({ results: z.array(z.record(z.string(), z.unknown())), next_cursor: z.string().nullable().optional() }).parse(await notionGet(organizationId, userId, `blocks/${next.id}/children?${url}`));
      for (const block of result.results) {
        const type = typeof block.type === "string" ? block.type : "";
        const body = block[type];
        if (body && typeof body === "object" && "rich_text" in body && Array.isArray(body.rich_text)) {
          const text = body.rich_text.map((part: unknown) => part && typeof part === "object" && "plain_text" in part && typeof part.plain_text === "string" ? part.plain_text : "").join("");
          if (text.trim()) lines.push(text.trim());
        }
        if (block.has_children === true && typeof block.id === "string" && next.depth < 2) queue.push({ id: block.id, depth: next.depth + 1 });
      }
      cursor = result.next_cursor ?? null;
      if (!cursor) break;
    }
  }
  const text = lines.join("\n").slice(0, 100000);
  if (!text) throw new Error("No readable text blocks were found on that Notion page.");
  return { pageId, text };
}
