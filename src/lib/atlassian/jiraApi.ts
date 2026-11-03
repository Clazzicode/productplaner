import { z } from "zod";
import type { VerifiedForgeInvocation } from "./forgeAuth";

export class JiraApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super("Jira API request failed.");
    this.name = "JiraApiError";
  }
}

const projectPageSchema = z.object({
  values: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    key: z.string().min(1).max(20),
    name: z.string().min(1).max(255),
    projectTypeKey: z.string().max(50).optional(),
  }).passthrough()).max(100),
  isLast: z.boolean().optional(),
  total: z.number().int().nonnegative().optional(),
}).passthrough();

const issueTypeSchema = z.array(z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1).max(255),
  subtask: z.boolean().optional(),
  hierarchyLevel: z.number().int().optional(),
}).passthrough()).max(1000);

const fieldSchema = z.array(z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(255),
  custom: z.boolean().optional(),
  schema: z.object({ type: z.string().optional(), custom: z.string().optional() }).passthrough().optional(),
}).passthrough()).max(5000);

const statusesSchema = z.array(z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1).max(255),
  statuses: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), name: z.string().min(1).max(255) }).passthrough()).optional(),
}).passthrough()).max(1000);

const jiraSearchSchema = z.object({
  issues: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    key: z.string().regex(/^[A-Z][A-Z0-9_]{1,19}-[0-9]{1,10}$/),
    fields: z.object({
      status: z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        name: z.string().min(1).max(255),
      }).passthrough(),
      updated: z.string().datetime({ offset: true }),
    }).passthrough(),
  }).passthrough()).max(50),
}).passthrough();

function oauthToken(request: Request): string {
  const token = request.headers.get("x-forge-oauth-system") ?? request.headers.get("x-forge-oauth-user");
  if (!token || token.length > 16_384 || /\s/.test(token)) {
    throw new JiraApiError(401, "JIRA_AUTH_TOKEN_REQUIRED");
  }
  return token;
}

async function jiraGet(request: Request, invocation: VerifiedForgeInvocation, path: string): Promise<unknown> {
  const token = oauthToken(request);
  const url = `${invocation.apiBaseUrl}/rest/api/3/${path.replace(/^\//, "")}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const code = response.status === 429 ? "JIRA_RATE_LIMITED"
      : response.status === 401 || response.status === 403 ? "JIRA_PERMISSION_DENIED"
        : response.status >= 500 ? "JIRA_TEMPORARY_FAILURE" : "JIRA_REQUEST_REJECTED";
    throw new JiraApiError(response.status, code);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 2_000_000) {
    await response.body?.cancel();
    throw new JiraApiError(502, "JIRA_RESPONSE_TOO_LARGE");
  }
  if (!response.body) throw new JiraApiError(502, "JIRA_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 2_000_000) {
        await reader.cancel();
        throw new JiraApiError(502, "JIRA_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new JiraApiError(502, "JIRA_RESPONSE_INVALID"); }
}

export async function discoverProjects(request: Request, invocation: VerifiedForgeInvocation) {
  const projects: Array<{ id: string; key: string; name: string; projectTypeKey?: string }> = [];
  for (let page = 0; page < 4; page += 1) {
    const response = projectPageSchema.safeParse(await jiraGet(
      request,
      invocation,
      `project/search?startAt=${page * 50}&maxResults=50&orderBy=name`,
    ));
    if (!response.success) throw new JiraApiError(502, "JIRA_PROJECT_RESPONSE_INVALID");
    projects.push(...response.data.values.map(({ id, key, name, projectTypeKey }) => ({ id, key, name, projectTypeKey })));
    if (response.data.isLast === true || projects.length >= (response.data.total ?? Infinity)) break;
  }
  return { projects, truncated: projects.length === 200 };
}

export async function discoverProjectMetadata(
  request: Request,
  invocation: VerifiedForgeInvocation,
  projectId: string,
) {
  if (!/^\d{1,20}$/.test(projectId)) throw new JiraApiError(422, "INVALID_JIRA_PROJECT_ID");
  const [typesRaw, fieldsRaw, statusesRaw] = await Promise.all([
    jiraGet(request, invocation, `issuetype/project?projectId=${encodeURIComponent(projectId)}&maxResults=1000`),
    jiraGet(request, invocation, "field"),
    jiraGet(request, invocation, `project/${encodeURIComponent(projectId)}/statuses`),
  ]);
  const types = issueTypeSchema.safeParse(typesRaw);
  const fields = fieldSchema.safeParse(fieldsRaw);
  const statuses = statusesSchema.safeParse(statusesRaw);
  if (!types.success || !fields.success || !statuses.success) throw new JiraApiError(502, "JIRA_METADATA_RESPONSE_INVALID");

  const statusValues = statuses.data.flatMap((group) => group.statuses ?? [group]);
  return {
    issueTypes: types.data.map(({ id, name, subtask, hierarchyLevel }) => ({ id, name, subtask: subtask ?? false, hierarchyLevel: hierarchyLevel ?? 0 })),
    fields: fields.data
      .filter((field) => field.schema?.type !== "array" && field.schema?.type !== "any")
      .map(({ id, name, custom, schema }) => ({ id, name, custom: custom ?? false, type: schema?.type ?? "unknown" })),
    statuses: [...new Map(statusValues.map(({ id, name }) => [id, { id, name }])).values()],
  };
}

/** Reads status for only the previously mapped keys. Jira is never mutated. */
export async function readMappedIssueStatuses(
  request: Request,
  invocation: VerifiedForgeInvocation,
  issueKeys: string[],
) {
  if (issueKeys.length > 50 || issueKeys.some((key) => !/^[A-Z][A-Z0-9_]{1,19}-[0-9]{1,10}$/.test(key))) {
    throw new JiraApiError(422, "INVALID_MAPPED_JIRA_ISSUES");
  }
  if (issueKeys.length === 0) return { issues: [] };
  const uniqueKeys = [...new Set(issueKeys)];
  const query = new URLSearchParams({
    jql: `key in (${uniqueKeys.join(",")})`,
    fields: "status,updated",
    maxResults: "50",
  });
  const parsed = jiraSearchSchema.safeParse(await jiraGet(request, invocation, `search/jql?${query.toString()}`));
  if (!parsed.success) throw new JiraApiError(502, "JIRA_STATUS_RESPONSE_INVALID");
  const allowedKeys = new Set(uniqueKeys);
  return {
    issues: parsed.data.issues
      .filter((issue) => allowedKeys.has(issue.key))
      .map((issue) => ({
        id: issue.id,
        key: issue.key,
        statusId: issue.fields.status.id,
        statusName: issue.fields.status.name,
        updatedAt: new Date(issue.fields.updated).toISOString(),
      })),
  };
}
