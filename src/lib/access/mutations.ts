// Step 8C access mutations + impact preview (docs/V2-RESOURCE-ACCESS.md §9,
// §17). Every write here is what the three UI entry points (User/Team/
// Initiative) all call through — no entry point talks to `db.initiativeAccess`
// directly, so there is one place tenant isolation and the External View
// ceiling are enforced.

import { db } from "@/lib/db";
import { resolveInitiativeAccess, type PermissionLevel, type ResolvedAccess } from "./resolution";

export type MutationError =
  | { error: "not_found" }
  | { error: "cross_tenant" }
  | { error: "external_above_view" }
  | { error: "duplicate_grant" }
  | { error: "last_owner" };

export type MutationResult<T> = { ok: true; data: T } | { ok: false; reason: MutationError["error"] };

interface GrantTarget {
  organizationId: string; // acting user's organization — every check is scoped to this
  initiativeId: string;
  permission: PermissionLevel;
}

async function assertSameOrgInitiative(initiativeId: string, organizationId: string) {
  const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
  if (!initiative || initiative.organizationId !== organizationId) return false;
  return true;
}

/** External users may only ever be granted View — checked here, not just
 * hidden in the picker (docs/V2-ACCESS-TEAMS-VISIBILITY.md §7, §15). */
async function wouldExceedExternalCeiling(userId: string, permission: PermissionLevel): Promise<boolean> {
  if (permission === "view") return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { memberType: true } });
  return user?.memberType === "external";
}

export async function grantDirectAccess(
  target: GrantTarget & { userId: string },
): Promise<MutationResult<{ id: string }>> {
  if (!(await assertSameOrgInitiative(target.initiativeId, target.organizationId))) {
    return { ok: false, reason: "cross_tenant" };
  }
  const user = await db.user.findUnique({ where: { id: target.userId }, select: { homeOrganizationId: true } });
  if (!user || user.homeOrganizationId !== target.organizationId) return { ok: false, reason: "cross_tenant" };
  if (await wouldExceedExternalCeiling(target.userId, target.permission)) {
    return { ok: false, reason: "external_above_view" };
  }

  try {
    const grant = await db.initiativeAccess.create({
      data: { initiativeId: target.initiativeId, userId: target.userId, permission: target.permission },
    });
    return { ok: true, data: { id: grant.id } };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "duplicate_grant" };
    throw err;
  }
}

/** Team grants are never capped at grant time — a team may be granted Edit
 * even if it has external members. The cap applies per-member at resolution
 * time (resolution.ts) so internal members still get the team's real level
 * while external members are individually held to View. See
 * docs/V2-RESOURCE-ACCESS.md §5/§15. */
export async function grantTeamAccess(
  target: GrantTarget & { teamId: string },
): Promise<MutationResult<{ id: string }>> {
  if (!(await assertSameOrgInitiative(target.initiativeId, target.organizationId))) {
    return { ok: false, reason: "cross_tenant" };
  }
  const team = await db.team.findUnique({ where: { id: target.teamId }, select: { organizationId: true } });
  if (!team || team.organizationId !== target.organizationId) return { ok: false, reason: "cross_tenant" };

  try {
    const grant = await db.initiativeAccess.create({
      data: { initiativeId: target.initiativeId, teamId: target.teamId, permission: target.permission },
    });
    return { ok: true, data: { id: grant.id } };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "duplicate_grant" };
    throw err;
  }
}

export async function changeGrantPermission(
  grantId: string,
  organizationId: string,
  permission: PermissionLevel,
): Promise<MutationResult<{ id: string }>> {
  const grant = await db.initiativeAccess.findUnique({
    where: { id: grantId },
    include: { initiative: { select: { organizationId: true } }, user: { select: { memberType: true } } },
  });
  if (!grant || grant.initiative.organizationId !== organizationId) return { ok: false, reason: "cross_tenant" };
  if (grant.userId && permission !== "view" && grant.user?.memberType === "external") {
    return { ok: false, reason: "external_above_view" };
  }
  if (permission !== "owner" && (await isLastOwnerGrant(grantId, grant.initiativeId, grant.permission === "owner"))) {
    return { ok: false, reason: "last_owner" };
  }
  await db.initiativeAccess.update({ where: { id: grantId }, data: { permission } });
  return { ok: true, data: { id: grantId } };
}

export async function revokeGrant(grantId: string, organizationId: string): Promise<MutationResult<{ id: string }>> {
  const grant = await db.initiativeAccess.findUnique({
    where: { id: grantId },
    include: { initiative: { select: { organizationId: true } } },
  });
  if (!grant || grant.initiative.organizationId !== organizationId) return { ok: false, reason: "cross_tenant" };
  if (await isLastOwnerGrant(grantId, grant.initiativeId, grant.permission === "owner")) {
    return { ok: false, reason: "last_owner" };
  }
  await db.initiativeAccess.delete({ where: { id: grantId } });
  return { ok: true, data: { id: grantId } };
}

/**
 * Blocks removing/downgrading an initiative's only remaining direct Owner
 * grant (docs/V2-ORG-ADMIN-IA.md §20 "Removing an initiative's Owner").
 * Simplified from the IA's suggested atomic "reassign in the same action" UX
 * to a plain block-until-you-grant-someone-else-first — the same shape as
 * the last-active-org-admin safeguard in docs/V2-USERS-TEAMS.md. Lower
 * stakes than that one: an Organization Admin always has implicit
 * Owner-equivalent access regardless of this grant, so this never actually
 * locks an initiative away from every admin — it only keeps the *stored*
 * Owner grant from silently disappearing.
 */
async function isLastOwnerGrant(grantId: string, initiativeId: string, isOwnerGrant: boolean): Promise<boolean> {
  if (!isOwnerGrant) return false;
  const otherOwners = await db.initiativeAccess.count({
    where: { initiativeId, permission: "owner", userId: { not: null }, id: { not: grantId } },
  });
  return otherOwners === 0;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";
}

// ---------- Impact preview (docs/V2-RESOURCE-ACCESS.md §9) ----------

export interface AccessImpact {
  userId: string;
  userName: string;
  before: ResolvedAccess;
  after: ResolvedAccess;
}

interface ActorRow {
  id: string;
  organizationId: string;
  accessLevel: string;
  status: string;
  memberType: string;
}

async function resolveExcludingOrOverriding(
  userId: string,
  initiativeId: string,
  grantId: string,
  overridePermission: PermissionLevel | null,
): Promise<ResolvedAccess> {
  // `userId` here is always someone the impact preview is inspecting (the
  // grantee or a team's members), never the current session's actor — this
  // deliberately uses their home organization, same reasoning as
  // listResolvedAccessForUser in initiativeAccess.ts.
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, homeOrganizationId: true, accessLevel: true, status: true, memberType: true },
  });
  const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
  if (!row || !initiative) {
    return { level: "none", sources: [], sourceLabel: "", externallyCapped: false };
  }
  const actor: ActorRow = { ...row, organizationId: row.homeOrganizationId };

  const directRow = await db.initiativeAccess.findUnique({ where: { initiativeId_userId: { initiativeId, userId } } });
  const directGrant =
    directRow && directRow.id === grantId
      ? overridePermission
        ? { permission: overridePermission }
        : null
      : directRow
        ? { permission: directRow.permission as PermissionLevel }
        : null;

  const memberships = await db.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = memberships.map((m) => m.teamId);
  const teamGrantRows =
    teamIds.length > 0
      ? await db.initiativeAccess.findMany({
          where: { initiativeId, teamId: { in: teamIds } },
          include: { team: { select: { name: true } } },
        })
      : [];
  const teamGrants: { teamName: string; permission: PermissionLevel }[] = [];
  for (const g of teamGrantRows) {
    const permission = g.id === grantId ? overridePermission : (g.permission as PermissionLevel);
    if (permission) teamGrants.push({ teamName: g.team!.name, permission });
  }

  return resolveInitiativeAccess({
    actor,
    initiativeOrganizationId: initiative.organizationId,
    directGrant,
    teamGrants,
  });
}

/**
 * Before/after for every user affected by revoking or changing one grant.
 * A direct grant affects exactly one user; a team grant affects every current
 * member. Both "before" and "after" are computed by the same
 * resolveInitiativeAccess() the rest of the system uses — this never
 * duplicates the permission rule.
 */
export async function previewGrantChange(
  grantId: string,
  organizationId: string,
  newPermission: PermissionLevel | null, // null = revoke
): Promise<MutationResult<{ affected: AccessImpact[] }>> {
  const grant = await db.initiativeAccess.findUnique({
    where: { id: grantId },
    include: {
      initiative: { select: { organizationId: true } },
      user: { select: { id: true, name: true } },
      team: { select: { id: true } },
    },
  });
  if (!grant || grant.initiative.organizationId !== organizationId) return { ok: false, reason: "cross_tenant" };

  const affectedUsers = grant.userId
    ? [{ id: grant.user!.id, name: grant.user!.name }]
    : (
        await db.teamMember.findMany({
          where: { teamId: grant.teamId! },
          include: { user: { select: { id: true, name: true } } },
        })
      ).map((m) => m.user);

  const results: AccessImpact[] = [];
  for (const u of affectedUsers) {
    const before = await resolveExcludingOrOverriding(u.id, grant.initiativeId, "__none__", null);
    const after = await resolveExcludingOrOverriding(u.id, grant.initiativeId, grantId, newPermission);
    results.push({ userId: u.id, userName: u.name, before, after });
  }
  return { ok: true, data: { affected: results } };
}
