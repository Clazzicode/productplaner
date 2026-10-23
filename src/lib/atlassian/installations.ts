import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, withServiceContext } from "@/lib/db";
import type { VerifiedForgeInvocation } from "./forgeAuth";

type InstallationResult = {
  id: string;
  status: string;
  organization_id: string | null;
};

export async function registerVerifiedInstallation(
  invocation: VerifiedForgeInvocation,
): Promise<InstallationResult> {
  return withServiceContext(async () => {
    const rows = await db.$queryRaw<InstallationResult[]>(Prisma.sql`
      SELECT * FROM app_private.upsert_atlassian_installation(
        ${randomUUID()}::text,
        ${invocation.installationId}::text,
        ${invocation.appId}::text,
        ${invocation.cloudId}::text,
        ${invocation.apiBaseUrl}::text,
        ${invocation.expiresAt}::timestamp
      )
    `);
    const installation = rows[0];
    if (!installation) throw new Error("Atlassian installation was not recorded.");
    return installation;
  });
}

export async function consumePairingCode(
  codeHash: string,
  invocation: VerifiedForgeInvocation,
): Promise<{ organization_id: string; installation_id: string; status: string }> {
  return withServiceContext(async () => {
    const rows = await db.$queryRaw<Array<{
      organization_id: string;
      installation_id: string;
      status: string;
    }>>(Prisma.sql`
      SELECT * FROM app_private.consume_atlassian_pairing_code(
        ${codeHash}::text,
        ${invocation.installationId}::text,
        ${invocation.appId}::text
      )
    `);
    if (!rows[0]) throw new Error("Jira pairing could not be completed.");
    return rows[0];
  });
}

export async function isLinkedInstallation(invocation: VerifiedForgeInvocation): Promise<boolean> {
  if (!invocation.cloudId) return false;
  return withServiceContext(async () => {
    const rows = await db.$queryRaw<Array<{ id: string; organization_id: string; cloud_id: string }>>(Prisma.sql`
      SELECT * FROM app_private.get_active_atlassian_installation(
        ${invocation.installationId}::text,
        ${invocation.appId}::text,
        ${invocation.cloudId}::text
      )
    `);
    return Boolean(rows[0]?.organization_id);
  });
}

export type JiraStatusSyncContext = {
  organizationId: string;
  projectBindingId: string;
  jiraProjectKey: string;
  mappedIssues: Array<{ jiraIssueId: string; jiraIssueKey: string }>;
};

export async function getJiraStatusSyncContext(
  projectBindingId: string,
  invocation: VerifiedForgeInvocation,
): Promise<JiraStatusSyncContext | null> {
  if (!invocation.cloudId) return null;
  return withServiceContext(async () => {
    const rows = await db.$queryRaw<Array<{
      organization_id: string;
      project_binding_id: string;
      jira_project_key: string;
      mapped_issues: JiraStatusSyncContext["mappedIssues"];
    }>>(Prisma.sql`
      SELECT * FROM app_private.get_jira_status_sync_context(
        ${invocation.installationId}::text,
        ${invocation.appId}::text,
        ${invocation.cloudId}::text,
        ${projectBindingId}::text
      )
    `);
    const row = rows[0];
    return row ? {
      organizationId: row.organization_id,
      projectBindingId: row.project_binding_id,
      jiraProjectKey: row.jira_project_key,
      mappedIssues: row.mapped_issues,
    } : null;
  });
}

export async function applyJiraStatusSnapshot(
  projectBindingId: string,
  invocation: VerifiedForgeInvocation,
  observations: Array<{
    jiraIssueId: string;
    jiraIssueKey: string;
    statusId: string;
    statusName: string;
    updatedAt: string;
    snapshotHash: string;
  }>,
): Promise<{ matched: number; changed: number }> {
  if (!invocation.cloudId) throw new Error("Jira cloud identity is required.");
  return withServiceContext(async () => {
    const payload = JSON.stringify(observations);
    const rows = await db.$queryRaw<Array<{ matched_count: number; changed_count: number }>>(Prisma.sql`
      SELECT * FROM app_private.apply_jira_status_snapshot(
        ${invocation.installationId}::text,
        ${invocation.appId}::text,
        ${invocation.cloudId}::text,
        ${projectBindingId}::text,
        ${payload}::jsonb
      )
    `);
    return { matched: rows[0]?.matched_count ?? 0, changed: rows[0]?.changed_count ?? 0 };
  });
}
