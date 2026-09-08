// Organization Admin Dashboard data loader (Step 8D —
// docs/V2-ORG-ADMIN-DASHBOARD.md). Same conventions as
// globalDashboardData.ts: read-only, org-scoped, reuses the exact same
// health/capacity functions the initiative dashboard and Standard Dashboard
// already use (scheduleHealth, computeCapacityForecast) — no second scoring
// system. Every number here is either a real column or derived from real
// User/Team/TeamMember/Initiative/InitiativeAccess/IntegrationConnection
// rows; nothing is fabricated. No unit tests for this file, matching
// globalDashboardData.ts's own precedent — verified live in-browser instead.

import { db } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { scheduleHealth, type HealthStatus } from "@/lib/generation/health";
import { LAYER_SEQUENCE, type LayerType } from "@/lib/generation/types";

export interface AdminOrgSummary {
  activeUsers: number;
  totalUsers: number;
  disabledUsers: number;
  archivedUsers: number;
  internalUsers: number;
  externalUsers: number;
  orgAdmins: number;
  teams: number;
  activeInitiatives: number;
  initiativesNeedingAttention: number;
  attentionCount: number;
  upcomingReleases: number;
}

export interface PortfolioRow {
  id: string;
  name: string;
  status: string; // draft | intake_in_progress | generated
  health: HealthStatus | null; // null until generated — nothing to score yet
  ownerName: string;
  teamAccessCount: number;
  accessCoverage: number;
  deliveryPercent: number | null;
  nextMilestone: { label: string; date: Date } | null;
}

export type AttentionSeverity = "info" | "warning" | "risk";

export interface AdminAttentionItem {
  severity: AttentionSeverity;
  title: string;
  detail: string;
  href: string;
}

export interface UsersIntelligence {
  active: number;
  disabled: number;
  archived: number;
  internal: number;
  external: number;
  noTeam: number;
  noWorkingRole: number;
  admins: number;
}

export interface TeamsIntelligence {
  total: number;
  zeroMembers: number;
  noInitiativeAccess: number;
  withExternalMembers: number;
}

export interface AccessIntelligence {
  initiativesWithExternalAccess: number;
  externalUsersWithAccess: number;
  externalUsersWithoutAccess: number;
  usersWithDirectGrants: number;
  disabledUsersWithStoredGrants: number;
  usersWithNoResourceAccess: number;
}

export interface DeliveryIntelligence {
  upcomingReleases: { name: string; date: Date; initiativeName: string; href: string }[];
  atRiskInitiatives: number;
  overAllocatedSprints: number;
  approachingLaunch: { name: string; date: Date; href: string }[];
}

export interface AdminTimelineEntry {
  date: Date;
  label: string;
  kind: "sprint" | "release" | "launch";
  initiativeName: string;
  href: string;
}

export interface IntegrationConnectionSummary {
  providerName: string;
  status: string;
  lastSyncAt: Date | null;
  lastSyncMessage: string | null;
}

export interface IntegrationHealthSummary {
  connections: IntegrationConnectionSummary[];
  connectedCount: number;
  totalProviders: number;
}

export interface AdminDashboardData {
  orgName: string;
  operationalSummary: string;
  summary: AdminOrgSummary;
  portfolio: PortfolioRow[];
  attention: AdminAttentionItem[];
  users: UsersIntelligence;
  teams: TeamsIntelligence;
  access: AccessIntelligence;
  delivery: DeliveryIntelligence;
  timeline: AdminTimelineEntry[];
  integrations: IntegrationHealthSummary;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { risk: 0, warning: 1, info: 2 };

function buildOperationalSummary(params: {
  activeUsers: number;
  teams: number;
  activeInitiatives: number;
  attentionCount: number;
  nextCheckpoint: AdminTimelineEntry | null;
}): string {
  const { activeUsers, teams, activeInitiatives, attentionCount, nextCheckpoint } = params;
  if (activeInitiatives === 0) {
    return "No initiatives yet — organization activity will appear here once the first plan is created.";
  }
  const usersClause = `${activeUsers} active ${activeUsers === 1 ? "user" : "users"} across ${teams} ${teams === 1 ? "team" : "teams"}`;
  const initiativeClause = `${activeInitiatives} ${activeInitiatives === 1 ? "initiative" : "initiatives"} in the portfolio`;
  const attentionClause =
    attentionCount === 0 ? "nothing needs attention right now" : `${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} attention`;
  const checkpointClause = nextCheckpoint
    ? ` Next checkpoint: ${nextCheckpoint.label.toLowerCase()} on ${nextCheckpoint.date.toLocaleDateString()}.`
    : "";
  return `${usersClause}. ${initiativeClause} — ${attentionClause}.${checkpointClause}`;
}

export async function loadAdminDashboardData(organizationId: string): Promise<AdminDashboardData> {
  const today = new Date();

  const [org, users, teams, initiatives, initiativeAccessRows, integrationConnections, totalProviders] =
    await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      db.user.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          accessLevel: true,
          workingRole: true,
          memberType: true,
          status: true,
          teamMemberships: { select: { teamId: true } },
        },
      }),
      db.team.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          members: { select: { user: { select: { memberType: true } } } },
          _count: { select: { initiativeAccess: true } },
        },
      }),
      db.initiative.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
        include: {
          user: { select: { id: true, name: true } },
          prototype: { include: { layerLocks: true } },
        },
      }),
      db.initiativeAccess.findMany({
        where: { initiative: { organizationId } },
        select: {
          initiativeId: true,
          permission: true,
          userId: true,
          teamId: true,
          user: { select: { id: true, name: true, memberType: true, status: true } },
        },
      }),
      db.integrationConnection.findMany({
        where: { organizationId },
        include: { provider: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      db.integrationProvider.count({ where: { isActive: true } }),
    ]);

  // ---------- generated initiatives: sprints/releases, batched ----------
  const generatedInitiatives = initiatives.filter((i) => i.status === "generated" && i.prototype);
  const prototypeIds = generatedInitiatives.map((i) => i.prototype!.id);

  const [sprints, releases] =
    prototypeIds.length > 0
      ? await Promise.all([
          db.sprint.findMany({
            where: { prototypeId: { in: prototypeIds } },
            orderBy: { sprintNumber: "asc" },
            include: { stories: { select: { points: true } } },
          }),
          db.release.findMany({
            where: { prototypeId: { in: prototypeIds } },
            orderBy: { targetDate: "asc" },
          }),
        ])
      : [[] as never[], [] as never[]];

  const sprintsByPrototype = new Map<string, typeof sprints>();
  for (const s of sprints) {
    const list = sprintsByPrototype.get(s.prototypeId) ?? [];
    list.push(s);
    sprintsByPrototype.set(s.prototypeId, list);
  }
  const releasesByPrototype = new Map<string, typeof releases>();
  for (const r of releases) {
    const list = releasesByPrototype.get(r.prototypeId) ?? [];
    list.push(r);
    releasesByPrototype.set(r.prototypeId, list);
  }

  // ---------- access grants, grouped ----------
  const accessByInitiative = new Map<string, typeof initiativeAccessRows>();
  for (const g of initiativeAccessRows) {
    const list = accessByInitiative.get(g.initiativeId) ?? [];
    list.push(g);
    accessByInitiative.set(g.initiativeId, list);
  }
  const teamsWithGrants = new Set(initiativeAccessRows.filter((g) => g.teamId).map((g) => g.teamId!));
  const directGranteeUserIds = new Set(initiativeAccessRows.filter((g) => g.userId).map((g) => g.userId!));
  const ownerGrantsByInitiative = new Map<string, typeof initiativeAccessRows>();
  for (const g of initiativeAccessRows) {
    if (g.permission !== "owner" || !g.userId) continue;
    const list = ownerGrantsByInitiative.get(g.initiativeId) ?? [];
    list.push(g);
    ownerGrantsByInitiative.set(g.initiativeId, list);
  }

  // ---------- portfolio + delivery + timeline ----------
  const portfolio: PortfolioRow[] = [];
  const timeline: AdminTimelineEntry[] = [];
  const upcomingReleasesList: DeliveryIntelligence["upcomingReleases"] = [];
  const approachingLaunch: DeliveryIntelligence["approachingLaunch"] = [];
  let initiativesNeedingAttention = 0;
  let atRiskInitiatives = 0;
  let overAllocatedSprints = 0;

  for (const init of initiatives) {
    const grants = accessByInitiative.get(init.id) ?? [];
    const teamAccessCount = new Set(grants.filter((g) => g.teamId).map((g) => g.teamId)).size;
    const accessCoverage = grants.length;

    let health: HealthStatus | null = null;
    let deliveryPercent: number | null = null;
    let nextMilestone: { label: string; date: Date } | null = null;

    if (init.status === "generated" && init.prototype) {
      const protoSprints = sprintsByPrototype.get(init.prototype.id) ?? [];
      const protoReleases = releasesByPrototype.get(init.prototype.id) ?? [];
      const locks = init.prototype.layerLocks;
      const isLocked = (t: LayerType) => locks.find((l) => l.layerType === t)?.state === "locked";
      const lockedCount = LAYER_SEQUENCE.filter(isLocked).length;
      deliveryPercent = Math.round((lockedCount / LAYER_SEQUENCE.length) * 100);

      const forecast = computeCapacityForecast(protoSprints);
      const overAllocated = forecast.filter((f) => f.status === "over-allocated");
      overAllocatedSprints += overAllocated.length;
      const totalPlannedPoints = protoSprints.reduce(
        (n, s) => n + s.stories.reduce((m, story) => m + (story.points ?? 1), 0),
        0,
      );
      const totalCapacity = protoSprints.reduce((n, s) => n + s.capacityPoints, 0);
      health = overAllocated.length > 0 ? "at_risk" : scheduleHealth(totalPlannedPoints, totalCapacity);
      if (health !== "on_track") initiativesNeedingAttention++;
      if (health === "at_risk") atRiskInitiatives++;

      const upcomingRelease = protoReleases.find((r) => r.targetDate >= today) ?? protoReleases[protoReleases.length - 1] ?? null;
      if (upcomingRelease) nextMilestone = { label: upcomingRelease.name, date: upcomingRelease.targetDate };

      const initHref = `/initiatives/${init.id}/workspace/sprints`;
      for (const r of protoReleases) {
        if (r.targetDate < today) continue;
        timeline.push({ date: r.targetDate, label: `${r.name} target`, kind: "release", initiativeName: init.name, href: initHref });
        upcomingReleasesList.push({ name: r.name, date: r.targetDate, initiativeName: init.name, href: initHref });
      }
      for (const s of protoSprints) {
        if (s.startDate < today) continue;
        timeline.push({ date: s.startDate, label: `Sprint ${s.sprintNumber} starts`, kind: "sprint", initiativeName: init.name, href: initHref });
      }
    }

    if (init.targetLaunchDate && init.targetLaunchDate >= today) {
      const launchHref = init.status === "generated" ? `/initiatives/${init.id}/dashboard` : `/initiatives/${init.id}/intake`;
      timeline.push({ date: init.targetLaunchDate, label: `${init.name} launch target`, kind: "launch", initiativeName: init.name, href: launchHref });
      approachingLaunch.push({ name: init.name, date: init.targetLaunchDate, href: launchHref });
    }

    portfolio.push({
      id: init.id,
      name: init.name,
      status: init.status,
      health,
      ownerName: init.user.name,
      teamAccessCount,
      accessCoverage,
      deliveryPercent,
      nextMilestone,
    });
  }

  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
  const cappedTimeline = timeline.slice(0, 12);
  upcomingReleasesList.sort((a, b) => a.date.getTime() - b.date.getTime());
  approachingLaunch.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ---------- users intelligence ----------
  const activeUsers = users.filter((u) => u.status === "active");
  const disabledUsers = users.filter((u) => u.status === "disabled");
  const archivedUsers = users.filter((u) => u.status === "archived");
  const internalUsers = users.filter((u) => u.memberType === "internal");
  const externalUsersAll = users.filter((u) => u.memberType === "external");
  const orgAdmins = activeUsers.filter((u) => u.accessLevel === "org_admin");
  const noTeamUsers = activeUsers.filter((u) => u.teamMemberships.length === 0);
  const noWorkingRoleUsers = activeUsers.filter((u) => !u.workingRole);
  // Attention-worthy variants exclude Organization Admins: an admin has
  // implicit access regardless of team membership and may not need a
  // personal Working Role (docs/V2-ARCHITECTURE.md §4's open question) — the
  // raw stats above still count everyone, but flagging an admin's own
  // no-team/no-role state as something to fix would be noise, not signal.
  const noTeamStandardUsers = noTeamUsers.filter((u) => u.accessLevel !== "org_admin");
  const noWorkingRoleStandardUsers = noWorkingRoleUsers.filter((u) => u.accessLevel !== "org_admin");
  const disabledUsersStillOnTeams = users.filter((u) => u.status !== "active" && u.teamMemberships.length > 0);

  const usersIntelligence: UsersIntelligence = {
    active: activeUsers.length,
    disabled: disabledUsers.length,
    archived: archivedUsers.length,
    internal: internalUsers.length,
    external: externalUsersAll.length,
    noTeam: noTeamUsers.length,
    noWorkingRole: noWorkingRoleUsers.length,
    admins: orgAdmins.length,
  };

  // ---------- teams intelligence ----------
  const zeroMemberTeams = teams.filter((t) => t.members.length === 0);
  const noAccessTeams = teams.filter((t) => t._count.initiativeAccess === 0);
  const externalMemberTeams = teams.filter((t) => t.members.some((m) => m.user.memberType === "external"));

  const teamsIntelligence: TeamsIntelligence = {
    total: teams.length,
    zeroMembers: zeroMemberTeams.length,
    noInitiativeAccess: noAccessTeams.length,
    withExternalMembers: externalMemberTeams.length,
  };

  // ---------- access intelligence ----------
  const usersWithDirectGrants = directGranteeUserIds.size;
  const disabledUsersWithStoredGrants = new Set(
    initiativeAccessRows.filter((g) => g.userId && g.user && g.user.status !== "active").map((g) => g.userId!),
  ).size;
  const initiativesWithExternalAccess = new Set(
    initiativeAccessRows.filter((g) => g.userId && g.user?.memberType === "external").map((g) => g.initiativeId),
  ).size;

  const activeExternalUsers = activeUsers.filter((u) => u.memberType === "external");
  const externalUsersWithAccessList = activeExternalUsers.filter((u) => {
    const hasDirect = directGranteeUserIds.has(u.id);
    const onGrantedTeam = u.teamMemberships.some((m) => teamsWithGrants.has(m.teamId));
    return hasDirect || onGrantedTeam;
  });

  const usersWithNoResourceAccessList = activeUsers.filter((u) => {
    if (u.accessLevel === "org_admin") return false; // implicit access — not an interesting signal
    const hasDirect = directGranteeUserIds.has(u.id);
    const onGrantedTeam = u.teamMemberships.some((m) => teamsWithGrants.has(m.teamId));
    return !hasDirect && !onGrantedTeam;
  });

  const accessIntelligence: AccessIntelligence = {
    initiativesWithExternalAccess,
    externalUsersWithAccess: externalUsersWithAccessList.length,
    externalUsersWithoutAccess: activeExternalUsers.length - externalUsersWithAccessList.length,
    usersWithDirectGrants,
    disabledUsersWithStoredGrants,
    usersWithNoResourceAccess: usersWithNoResourceAccessList.length,
  };

  // ---------- integration health ----------
  const integrations: IntegrationHealthSummary = {
    connections: integrationConnections.map((c) => ({
      providerName: c.provider.name,
      status: c.status,
      lastSyncAt: c.lastSyncAt,
      lastSyncMessage: c.lastSyncMessage,
    })),
    connectedCount: integrationConnections.filter((c) => c.isEnabled && c.status !== "available").length,
    totalProviders,
  };

  // ---------- admin attention (assembled from the values already computed above) ----------
  const attention: AdminAttentionItem[] = [];

  if (orgAdmins.length === 1) {
    attention.push({
      severity: "info",
      title: "Only one active Organization Admin",
      detail: `${orgAdmins[0].name} is the only active Organization Admin. Consider promoting a backup so the organization isn't a single point of failure.`,
      href: "/admin/users",
    });
  }

  for (const row of portfolio) {
    if (row.health === "at_risk") {
      attention.push({
        severity: "risk",
        title: `${row.name} is at risk`,
        detail: "Schedule health is at risk — one or more sprints are over-allocated, or the plan exceeds capacity.",
        href: `/initiatives/${row.id}/dashboard`,
      });
    }
  }

  for (const init of initiatives) {
    const disabledOwner = (ownerGrantsByInitiative.get(init.id) ?? []).find((g) => g.user && g.user.status !== "active");
    if (disabledOwner) {
      attention.push({
        severity: "warning",
        title: `${init.name}'s stored Owner grant belongs to a disabled user`,
        detail: `${disabledOwner.user!.name} is disabled but still holds the Owner grant. Implicit Organization Admin access is unaffected — consider reassigning it.`,
        href: `/admin/access/${init.id}`,
      });
    }
  }

  if (noAccessTeams.length > 0) {
    attention.push({
      severity: "info",
      title: `${noAccessTeams.length} ${noAccessTeams.length === 1 ? "team has" : "teams have"} no initiative access`,
      detail: "These teams exist but aren't granted access to any initiative yet.",
      href: "/teams",
    });
  }

  if (zeroMemberTeams.length > 0) {
    attention.push({
      severity: "info",
      title: `${zeroMemberTeams.length} ${zeroMemberTeams.length === 1 ? "team has" : "teams have"} no members`,
      detail: "Empty teams don't grant access to anyone yet.",
      href: "/teams",
    });
  }

  if (usersWithNoResourceAccessList.length > 0) {
    attention.push({
      severity: "warning",
      title: `${usersWithNoResourceAccessList.length} active ${usersWithNoResourceAccessList.length === 1 ? "user has" : "users have"} no resource access`,
      detail: "No direct grant and no team membership resolves to any initiative access.",
      href: "/admin/users",
    });
  }

  if (noTeamStandardUsers.length > 0) {
    attention.push({
      severity: "info",
      title: `${noTeamStandardUsers.length} active ${noTeamStandardUsers.length === 1 ? "user has" : "users have"} no team`,
      detail: "They can still hold direct access grants, but aren't on any team.",
      href: "/admin/users",
    });
  }

  if (noWorkingRoleStandardUsers.length > 0) {
    attention.push({
      severity: "info",
      title: `${noWorkingRoleStandardUsers.length} active ${noWorkingRoleStandardUsers.length === 1 ? "user has" : "users have"} no Working Role set`,
      detail: "Their personal dashboard falls back to a neutral widget order until one is set.",
      href: "/admin/users",
    });
  }

  if (disabledUsersStillOnTeams.length > 0) {
    attention.push({
      severity: "info",
      title: `${disabledUsersStillOnTeams.length} disabled ${disabledUsersStillOnTeams.length === 1 ? "user" : "users"} still on a team roster`,
      detail: "Allowed by design — disabling preserves team membership so re-enabling restores access with no rebuild.",
      href: "/teams",
    });
  }

  if (accessIntelligence.externalUsersWithoutAccess > 0) {
    attention.push({
      severity: "info",
      title: `${accessIntelligence.externalUsersWithoutAccess} external ${accessIntelligence.externalUsersWithoutAccess === 1 ? "user has" : "users have"} no active access`,
      detail: "Invited but not yet granted access to any initiative.",
      href: "/admin/users",
    });
  }

  if (disabledUsersWithStoredGrants > 0) {
    attention.push({
      severity: "info",
      title: `${disabledUsersWithStoredGrants} disabled ${disabledUsersWithStoredGrants === 1 ? "user" : "users"} still hold stored access grants`,
      detail: "Preserved by design — re-enabling restores access with no rebuild — but worth reviewing periodically.",
      href: "/admin/users",
    });
  }

  attention.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const summary: AdminOrgSummary = {
    activeUsers: activeUsers.length,
    totalUsers: users.length,
    disabledUsers: disabledUsers.length,
    archivedUsers: archivedUsers.length,
    internalUsers: internalUsers.length,
    externalUsers: externalUsersAll.length,
    orgAdmins: orgAdmins.length,
    teams: teams.length,
    activeInitiatives: initiatives.length,
    initiativesNeedingAttention,
    attentionCount: attention.length,
    upcomingReleases: upcomingReleasesList.length,
  };

  const operationalSummary = buildOperationalSummary({
    activeUsers: activeUsers.length,
    teams: teams.length,
    activeInitiatives: initiatives.length,
    attentionCount: attention.length,
    nextCheckpoint: cappedTimeline[0] ?? null,
  });

  return {
    orgName: org?.name ?? "Organization",
    operationalSummary,
    summary,
    portfolio,
    attention,
    users: usersIntelligence,
    teams: teamsIntelligence,
    access: accessIntelligence,
    delivery: {
      upcomingReleases: upcomingReleasesList.slice(0, 8),
      atRiskInitiatives,
      overAllocatedSprints,
      approachingLaunch: approachingLaunch.slice(0, 5),
    },
    timeline: cappedTimeline,
    integrations,
  };
}
