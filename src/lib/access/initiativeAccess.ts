// Step 8C DB-facing access layer (docs/V2-RESOURCE-ACCESS.md). Every function
// here is a thin fetch-then-call-resolveInitiativeAccess wrapper — the
// resolution rule itself lives in exactly one place (resolution.ts).

import { db } from "@/lib/db";
import { resolveInitiativeAccess, type PermissionLevel, type ResolvedAccess } from "./resolution";

export type { PermissionLevel, ResolvedAccess } from "./resolution";
export { formatAccessLabel, higherPermission, LEVEL_LABELS } from "./resolution";

/**
 * Shape of the *acting* user, already resolved to their current active
 * organization (getCurrentUser()'s return value satisfies this directly —
 * see docs/V2-MULTI-TENANT-AUTH.md). Deliberately NOT re-queried by userId
 * here: a multi-org user's `organizationId` must reflect whichever
 * organization they're currently switched into, not always their home one,
 * or a legitimately-switched-in member would be denied access to the very
 * organization they just switched to.
 */
export interface ActorRow {
  id: string;
  organizationId: string;
  accessLevel: string;
  status: string;
  memberType: string;
}

async function loadTeamGrants(userId: string, initiativeId: string) {
  const memberships = await db.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = memberships.map((m) => m.teamId);
  if (teamIds.length === 0) return [];
  const grants = await db.initiativeAccess.findMany({
    where: { initiativeId, teamId: { in: teamIds } },
    include: { team: { select: { name: true } } },
  });
  return grants.map((g) => ({ teamName: g.team!.name, permission: g.permission as PermissionLevel }));
}

/**
 * Resolves the current user's access to one initiative. Returns `"not_found"`
 * — never a distinguishable "none" — when the initiative doesn't exist *or*
 * belongs to a different organization, per docs/V2-RESOURCE-ACCESS.md §17:
 * never reveal whether a cross-org resource exists.
 */
export async function getResolvedAccess(
  actor: ActorRow,
  initiativeId: string,
): Promise<ResolvedAccess | "not_found"> {
  const initiative = await db.initiative.findUnique({ where: { id: initiativeId, organizationId: actor.organizationId }, select: { id: true, organizationId: true } });
  if (!initiative) return "not_found";
  if (actor.organizationId !== initiative.organizationId) return "not_found";

  const [directGrantRow, teamGrants] = await Promise.all([
    db.initiativeAccess.findUnique({ where: { initiativeId_userId: { initiativeId, userId: actor.id } } }),
    loadTeamGrants(actor.id, initiativeId),
  ]);

  return resolveInitiativeAccess({
    actor,
    initiativeOrganizationId: initiative.organizationId,
    directGrant: directGrantRow ? { permission: directGrantRow.permission as PermissionLevel } : null,
    teamGrants,
  });
}

/**
 * Every initiative in the user's organization the user currently has at
 * least View on, resolved (not just directly granted). This is the canonical
 * authorized-resource set — docs/V2-RESOURCE-ACCESS.md §16/§17 — the
 * Standard Dashboard and any global initiative list must filter through this,
 * not through raw organization/userId ownership.
 */
export async function listAuthorizedInitiativeIds(actor: ActorRow): Promise<string[] | null> {
  if (actor.status !== "active") return [];

  if (actor.accessLevel === "org_admin") {
    const all = await db.initiative.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true },
    });
    return all.map((i) => i.id);
  }

  const [directGrants, memberships] = await Promise.all([
    db.initiativeAccess.findMany({ where: { userId: actor.id, initiative: { organizationId: actor.organizationId } }, select: { initiativeId: true } }),
    db.teamMember.findMany({ where: { userId: actor.id }, select: { teamId: true } }),
  ]);
  const teamIds = memberships.map((m) => m.teamId);
  const teamGrants =
    teamIds.length > 0
      ? await db.initiativeAccess.findMany({ where: { teamId: { in: teamIds }, initiative: { organizationId: actor.organizationId } }, select: { initiativeId: true } })
      : [];

  const ids = new Set([...directGrants.map((g) => g.initiativeId), ...teamGrants.map((g) => g.initiativeId)]);
  return Array.from(ids);
}

/** User Detail's "Resource Access" section — resolved access for every
 * initiative in the org the user can currently reach, not a raw grant dump. */
export async function listResolvedAccessForUser(
  userId: string,
): Promise<{ initiativeId: string; initiativeName: string; access: ResolvedAccess }[]> {
  // `userId` here is a target being inspected by an admin (e.g. User Detail),
  // never the current session's actor — so this deliberately uses their home
  // organization, not an "active org" concept that only applies to a live
  // session.
  const actor = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, homeOrganizationId: true, accessLevel: true, status: true, memberType: true },
  });
  if (!actor) return [];
  const organizationId = actor.homeOrganizationId;
  const resolveActor: ActorRow = { ...actor, organizationId };

  const initiatives = await db.initiative.findMany({
    where: { organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const [directGrants, memberships] = await Promise.all([
    db.initiativeAccess.findMany({ where: { userId }, select: { initiativeId: true, permission: true } }),
    db.teamMember.findMany({ where: { userId }, select: { teamId: true } }),
  ]);
  const directByInitiative = new Map(directGrants.map((g) => [g.initiativeId, g.permission as PermissionLevel]));
  const teamIds = memberships.map((m) => m.teamId);
  const teamGrantRows =
    teamIds.length > 0
      ? await db.initiativeAccess.findMany({
          where: { teamId: { in: teamIds } },
          include: { team: { select: { name: true } } },
        })
      : [];
  const teamGrantsByInitiative = new Map<string, { teamName: string; permission: PermissionLevel }[]>();
  for (const g of teamGrantRows) {
    const list = teamGrantsByInitiative.get(g.initiativeId) ?? [];
    list.push({ teamName: g.team!.name, permission: g.permission as PermissionLevel });
    teamGrantsByInitiative.set(g.initiativeId, list);
  }

  const results: { initiativeId: string; initiativeName: string; access: ResolvedAccess }[] = [];
  for (const init of initiatives) {
    const direct = directByInitiative.get(init.id);
    const access = resolveInitiativeAccess({
      actor: resolveActor,
      initiativeOrganizationId: organizationId,
      directGrant: direct ? { permission: direct } : null,
      teamGrants: teamGrantsByInitiative.get(init.id) ?? [],
    });
    if (access.level !== "none") {
      results.push({ initiativeId: init.id, initiativeName: init.name, access });
    }
  }
  return results;
}

/** ADMIN -> Access / Initiative "Who Has Access" (docs/V2-RESOURCE-ACCESS.md §13). */
export async function listGrantsForInitiative(initiativeId: string) {
  const grants = await db.initiativeAccess.findMany({
    where: { initiativeId },
    include: {
      user: { select: { id: true, name: true, email: true, memberType: true, status: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return {
    teams: grants
      .filter((g) => g.teamId)
      .map((g) => ({
        grantId: g.id,
        teamId: g.team!.id,
        teamName: g.team!.name,
        permission: g.permission as PermissionLevel,
      })),
    individuals: grants
      .filter((g) => g.userId)
      .map((g) => ({
        grantId: g.id,
        userId: g.user!.id,
        userName: g.user!.name,
        userEmail: g.user!.email,
        memberType: g.user!.memberType,
        status: g.user!.status,
        permission: g.permission as PermissionLevel,
      })),
  };
}

/** Team Detail's "Initiative Access" section. */
export async function listGrantsForTeam(teamId: string) {
  const grants = await db.initiativeAccess.findMany({
    where: { teamId },
    include: { initiative: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return grants.map((g) => ({
    grantId: g.id,
    initiativeId: g.initiative.id,
    initiativeName: g.initiative.name,
    initiativeStatus: g.initiative.status,
    permission: g.permission as PermissionLevel,
  }));
}
