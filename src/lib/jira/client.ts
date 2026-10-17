import { decryptJiraSecret, encryptJiraSecret } from "./crypto";

export interface JiraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export interface JiraResource { id: string; url: string; name: string; scopes: string[] }
export interface JiraProject { id: string; key: string; name: string; projectTypeKey: string }
export interface JiraProjectMetadata {
  issueTypes: { id: string; name: string; subtask: boolean; statuses: { id: string; name: string }[] }[];
  fields: { id: string; name: string; custom: boolean; number: boolean }[];
  priorities: { id: string; name: string }[];
  versions: { id: string; name: string; released: boolean; releaseDate: string | null }[];
}

export interface JiraIssueSnapshot {
  id: string;
  key: string;
  summary: string;
  description: unknown;
  issueType: { id: string; name: string; subtask: boolean };
  status: { id: string; name: string; category: string };
  assignee: { accountId: string; displayName: string } | null;
  priority: { id: string; name: string } | null;
  labels: string[];
  parentKey: string | null;
  storyPoints: number | null;
  sprint: unknown;
  fixVersions: { id: string; name: string; releaseDate: string | null }[];
  updated: string | null;
  rawFields: Record<string, unknown>;
}

type Fetcher = typeof fetch;

function config() {
  const clientId = process.env.JIRA_CLIENT_ID?.trim();
  const clientSecret = process.env.JIRA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.JIRA_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Jira OAuth is not configured.");
  return { clientId, clientSecret, redirectUri };
}

async function jsonResponse(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error_description" in payload
      ? String(payload.error_description)
      : `Jira request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function jiraAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: "read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

function parseTokens(payload: unknown, priorRefreshToken?: string): JiraTokens {
  const row = object(payload);
  const accessToken = text(row.access_token);
  const refreshToken = text(row.refresh_token) || priorRefreshToken || "";
  const expiresIn = number(row.expires_in);
  if (!accessToken || !refreshToken || !expiresIn) throw new Error("Atlassian returned an incomplete OAuth token response.");
  return { accessToken, refreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000), scope: text(row.scope) };
}

export async function exchangeJiraCode(code: string, fetcher: Fetcher = fetch) {
  const { clientId, clientSecret, redirectUri } = config();
  const response = await fetcher("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  return parseTokens(await jsonResponse(response));
}

export async function refreshJiraTokens(refreshToken: string, fetcher: Fetcher = fetch) {
  const { clientId, clientSecret } = config();
  const response = await fetcher("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  return parseTokens(await jsonResponse(response), refreshToken);
}

export async function accessibleJiraResources(accessToken: string, fetcher: Fetcher = fetch): Promise<JiraResource[]> {
  const response = await fetcher("https://api.atlassian.com/oauth/token/accessible-resources", { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const payload = await jsonResponse(response);
  if (!Array.isArray(payload)) throw new Error("Atlassian returned invalid accessible resources.");
  return payload.map((value) => object(value)).map((row) => ({ id: text(row.id), url: text(row.url), name: text(row.name), scopes: Array.isArray(row.scopes) ? row.scopes.map(text).filter(Boolean) : [] })).filter((row) => row.id && row.url);
}

async function jiraApi(cloudId: string, accessToken: string, path: string, init: RequestInit = {}, fetcher: Fetcher = fetch) {
  const response = await fetcher(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  return jsonResponse(response);
}

export async function listJiraProjects(cloudId: string, accessToken: string, fetcher: Fetcher = fetch): Promise<JiraProject[]> {
  const payload = object(await jiraApi(cloudId, accessToken, "/rest/api/3/project/search?maxResults=100&orderBy=name", {}, fetcher));
  const values = Array.isArray(payload.values) ? payload.values : [];
  return values.map((value) => object(value)).map((row) => ({ id: text(row.id), key: text(row.key), name: text(row.name), projectTypeKey: text(row.projectTypeKey) })).filter((row) => row.id && row.key);
}

export async function getJiraProjectMetadata(input: { cloudId: string; accessToken: string; projectId: string; projectKey: string }, fetcher: Fetcher = fetch): Promise<JiraProjectMetadata> {
  const [statusesPayload, fieldsPayload, prioritiesPayload, versionsPayload] = await Promise.all([
    jiraApi(input.cloudId, input.accessToken, `/rest/api/3/project/${encodeURIComponent(input.projectKey)}/statuses`, {}, fetcher),
    jiraApi(input.cloudId, input.accessToken, "/rest/api/3/field", {}, fetcher),
    jiraApi(input.cloudId, input.accessToken, "/rest/api/3/priority", {}, fetcher),
    jiraApi(input.cloudId, input.accessToken, `/rest/api/3/project/${encodeURIComponent(input.projectId)}/versions`, {}, fetcher),
  ]);
  const statuses = Array.isArray(statusesPayload) ? statusesPayload.map(object) : [];
  const fields = Array.isArray(fieldsPayload) ? fieldsPayload.map(object) : [];
  const priorities = Array.isArray(prioritiesPayload) ? prioritiesPayload.map(object) : [];
  const versions = Array.isArray(versionsPayload) ? versionsPayload.map(object) : [];
  return {
    issueTypes: statuses.map((row) => ({
      id: text(row.id), name: text(row.name), subtask: Boolean(row.subtask),
      statuses: (Array.isArray(row.statuses) ? row.statuses.map(object) : []).map((status) => ({ id: text(status.id), name: text(status.name) })).filter((status) => status.id && status.name),
    })).filter((row) => row.id && row.name),
    fields: fields.map((row) => { const schema = object(row.schema); return { id: text(row.id), name: text(row.name), custom: Boolean(row.custom), number: text(schema.type) === "number" }; }).filter((row) => row.id && row.name),
    priorities: priorities.map((row) => ({ id: text(row.id), name: text(row.name) })).filter((row) => row.id && row.name),
    versions: versions.map((row) => ({ id: text(row.id), name: text(row.name), released: Boolean(row.released), releaseDate: text(row.releaseDate) || null })).filter((row) => row.id && row.name),
  };
}

export function issueSnapshot(value: unknown, storyPointsField: string | null): JiraIssueSnapshot | null {
  const row = object(value);
  const fields = object(row.fields);
  const issueType = object(fields.issuetype);
  const status = object(fields.status);
  const statusCategory = object(status.statusCategory);
  const assignee = fields.assignee ? object(fields.assignee) : null;
  const priority = fields.priority ? object(fields.priority) : null;
  const parent = fields.parent ? object(fields.parent) : null;
  const fixVersions = Array.isArray(fields.fixVersions) ? fields.fixVersions.map((item) => object(item)) : [];
  const id = text(row.id);
  const key = text(row.key);
  if (!id || !key) return null;
  return {
    id,
    key,
    summary: text(fields.summary),
    description: fields.description ?? null,
    issueType: { id: text(issueType.id), name: text(issueType.name), subtask: Boolean(issueType.subtask) },
    status: { id: text(status.id), name: text(status.name), category: text(statusCategory.key) },
    assignee: assignee ? { accountId: text(assignee.accountId), displayName: text(assignee.displayName) } : null,
    priority: priority ? { id: text(priority.id), name: text(priority.name) } : null,
    labels: Array.isArray(fields.labels) ? fields.labels.map(text).filter(Boolean) : [],
    parentKey: parent ? text(parent.key) || null : null,
    storyPoints: storyPointsField ? number(fields[storyPointsField]) : null,
    sprint: fields.customfield_10020 ?? null,
    fixVersions: fixVersions.map((version) => ({ id: text(version.id), name: text(version.name), releaseDate: text(version.releaseDate) || null })).filter((version) => version.id),
    updated: text(fields.updated) || null,
    rawFields: fields,
  };
}

const ISSUE_FIELDS = ["summary","description","issuetype","status","assignee","priority","labels","parent","fixVersions","updated"];

export async function getJiraIssue(input: { cloudId: string; accessToken: string; issueIdOrKey: string; storyPointsField?: string | null }, fetcher: Fetcher = fetch) {
  const storyPointsField = input.storyPointsField === undefined ? "customfield_10016" : input.storyPointsField;
  const fields = [...ISSUE_FIELDS, ...(storyPointsField ? [storyPointsField] : []), "customfield_10020"].join(",");
  const payload = await jiraApi(input.cloudId, input.accessToken, `/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}?fields=${encodeURIComponent(fields)}`, {}, fetcher);
  const issue = issueSnapshot(payload, storyPointsField);
  if (!issue) throw new Error("Jira returned an invalid issue response.");
  return issue;
}

export async function createJiraIssue(input: { cloudId: string; accessToken: string; fields: Record<string, unknown> }, fetcher: Fetcher = fetch) {
  const payload = object(await jiraApi(input.cloudId, input.accessToken, "/rest/api/3/issue", { method: "POST", body: JSON.stringify({ fields: input.fields }) }, fetcher));
  const id = text(payload.id); const key = text(payload.key);
  if (!id || !key) throw new Error("Jira created the issue but did not return its identity.");
  return { id, key };
}

export async function updateJiraIssue(input: { cloudId: string; accessToken: string; issueIdOrKey: string; fields: Record<string, unknown> }, fetcher: Fetcher = fetch) {
  await jiraApi(input.cloudId, input.accessToken, `/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}`, { method: "PUT", body: JSON.stringify({ fields: input.fields }) }, fetcher);
}

export async function registerJiraWebhook(input: { cloudId: string; accessToken: string; callbackUrl: string; projectKey: string }, fetcher: Fetcher = fetch) {
  const payload = object(await jiraApi(input.cloudId, input.accessToken, "/rest/api/3/webhook", { method: "POST", body: JSON.stringify({ url: input.callbackUrl, webhooks: [{ events: ["jira:issue_created", "jira:issue_updated", "jira:issue_deleted"], jqlFilter: `project = \"${input.projectKey.replaceAll('"', '\\"')}\"` }] }) }, fetcher));
  const rows = Array.isArray(payload.webhookRegistrationResult) ? payload.webhookRegistrationResult.map(object) : [];
  const id = rows.map((row) => number(row.createdWebhookId)).find((value): value is number => value !== null);
  if (!id) throw new Error("Jira did not register the webhook. Check the callback URL and OAuth scopes.");
  return { id: String(id) };
}

export async function refreshJiraWebhook(input: { cloudId: string; accessToken: string; webhookId: string }, fetcher: Fetcher = fetch) {
  const payload = object(await jiraApi(input.cloudId, input.accessToken, "/rest/api/3/webhook/refresh", { method: "PUT", body: JSON.stringify({ webhookIds: [Number(input.webhookId)] }) }, fetcher));
  const expiration = text(payload.expirationDate);
  if (!expiration || Number.isNaN(new Date(expiration).getTime())) throw new Error("Jira did not return the renewed webhook expiration.");
  return { expiresAt: new Date(expiration) };
}

export async function deleteJiraWebhooks(input: { cloudId: string; accessToken: string; webhookIds: string[] }, fetcher: Fetcher = fetch) {
  const webhookIds = input.webhookIds.map(Number).filter(Number.isFinite);
  if (!webhookIds.length) return;
  await jiraApi(input.cloudId, input.accessToken, "/rest/api/3/webhook", { method: "DELETE", body: JSON.stringify({ webhookIds }) }, fetcher);
}

export async function searchJiraIssues(input: { cloudId: string; accessToken: string; projectKey: string; nextPageToken?: string; storyPointsField?: string | null }, fetcher: Fetcher = fetch) {
  const storyPointsField = input.storyPointsField === undefined ? "customfield_10016" : input.storyPointsField;
  const body = { jql: `project = \"${input.projectKey.replaceAll('"', '\\"')}\" ORDER BY updated ASC`, maxResults: 100, ...(input.nextPageToken ? { nextPageToken: input.nextPageToken } : {}), fields: [...ISSUE_FIELDS,...(storyPointsField ? [storyPointsField] : []),"customfield_10020"] };
  const payload = object(await jiraApi(input.cloudId, input.accessToken, "/rest/api/3/search/jql", { method: "POST", body: JSON.stringify(body) }, fetcher));
  const issues = Array.isArray(payload.issues) ? payload.issues.map((issue) => issueSnapshot(issue, storyPointsField)).filter((issue): issue is JiraIssueSnapshot => Boolean(issue)) : [];
  return { issues, nextPageToken: text(payload.nextPageToken) || null, isLast: Boolean(payload.isLast) };
}

export function encryptedTokens(tokens: JiraTokens) {
  return { accessTokenCiphertext: encryptJiraSecret(tokens.accessToken), refreshTokenCiphertext: encryptJiraSecret(tokens.refreshToken), tokenExpiresAt: tokens.expiresAt, scopes: tokens.scope };
}

export function decryptedTokens(connection: { accessTokenCiphertext: string; refreshTokenCiphertext: string }) {
  return { accessToken: decryptJiraSecret(connection.accessTokenCiphertext), refreshToken: decryptJiraSecret(connection.refreshTokenCiphertext) };
}
