import { jsonError } from "@/lib/api";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function requireJiraManager(user: CurrentUser, initiativeId?: string | null) {
  const role = requireOrganizationRole(user, ["owner", "admin"]);
  if (!role.ok) return role;
  if (initiativeId) return requireInitiativeApiAccess(user, initiativeId, "edit");
  return { ok: true as const };
}

export async function jiraConnectionForUser(user: CurrentUser, connectionId: string) {
  const connection = await db.jiraConnection.findFirst({ where: { id: connectionId, organizationId: user.organizationId } });
  if (!connection) return { ok: false as const, response: jsonError("Not found.", 404) };
  const access = await requireJiraManager(user, connection.initiativeId);
  return access.ok ? { ok: true as const, connection } : access;
}

export async function jiraImportForUser(user: CurrentUser, runId: string) {
  const run = await db.jiraImportRun.findFirst({ where: { id: runId, organizationId: user.organizationId } });
  if (!run) return { ok: false as const, response: jsonError("Not found.", 404) };
  const access = await requireJiraManager(user, run.initiativeId);
  return access.ok ? { ok: true as const, run } : access;
}
