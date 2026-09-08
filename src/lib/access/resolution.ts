// Step 8C canonical permission resolution (docs/V2-RESOURCE-ACCESS.md).
//
// Pure, DB-agnostic — every route, page, and admin screen resolves access by
// calling `resolveInitiativeAccess()` (directly or via the DB-facing wrapper
// in initiativeAccess.ts). There is exactly one implementation of this rule;
// nothing re-derives it. See docs/V2-ACCESS-TEAMS-VISIBILITY.md §5 for the
// approved algorithm this implements.

export type PermissionLevel = "owner" | "edit" | "view";
export type ResolvedLevel = PermissionLevel | "none";

const RANK: Record<PermissionLevel, number> = { view: 1, edit: 2, owner: 3 };

export function higherPermission(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Does a resolved level satisfy a required minimum? "none" never satisfies anything. */
export function meetsMinimum(level: ResolvedLevel, minimum: PermissionLevel): boolean {
  return level !== "none" && RANK[level] >= RANK[minimum];
}

export interface AccessSource {
  kind: "org_admin" | "direct" | "team";
  /** Set only for kind === "team". */
  teamName?: string;
  level: PermissionLevel;
}

export interface ResolvedAccess {
  level: ResolvedLevel;
  /** Every source that contributed (before any external cap), for transparency
   * even when a source didn't end up being the highest. Empty when level is "none". */
  sources: AccessSource[];
  /** Human-readable phrase for the level's actual source(s) — "Organization Admin",
   * "Direct", "via Product Team", "via Product Team + PMO", "via Product Team + Direct".
   * Empty string when level is "none". Does not include the level itself — see
   * formatAccessLabel() for the full "{Level} — {source}" / "{Level} {source}" string. */
  sourceLabel: string;
  /** True when this resolution was capped below what the raw sources would
   * otherwise have produced, because the actor is an external member
   * (docs/V2-ACCESS-TEAMS-VISIBILITY.md §7 — External is always View-only). */
  externallyCapped: boolean;
}

export interface ResolveActor {
  id: string;
  organizationId: string;
  accessLevel: string; // standard_user | org_admin
  status: string; // active | disabled | archived
  memberType: string; // internal | external
}

export interface ResolveGrant {
  /** permission from a direct grant (userId matches the actor), or null if none. */
  permission: PermissionLevel;
}

export interface ResolveTeamGrant {
  teamName: string;
  permission: PermissionLevel;
}

export interface ResolveInitiativeAccessInput {
  actor: ResolveActor;
  /** Organization the target initiative belongs to. Callers are responsible for
   * treating a mismatch here as "not found," never as a resolvable "none" —
   * see docs/V2-RESOURCE-ACCESS.md §10 (tenant isolation) and §17 (unauthorized
   * UX must not reveal cross-org resources). This function still checks it
   * defensively and returns "none" so it's never the source of a leak on its
   * own, but the DB-facing wrapper is what actually enforces the not-found
   * distinction. */
  initiativeOrganizationId: string;
  directGrant: ResolveGrant | null;
  teamGrants: ResolveTeamGrant[];
}

const NONE: ResolvedAccess = { level: "none", sources: [], sourceLabel: "", externallyCapped: false };

export function resolveInitiativeAccess(input: ResolveInitiativeAccessInput): ResolvedAccess {
  const { actor, initiativeOrganizationId, directGrant, teamGrants } = input;

  // 1. Inactive/disabled/archived -> No Access, full stop. Preserves reversibility:
  // grants are never deleted just because a user is disabled (docs/V2-RESOURCE-ACCESS.md §11).
  if (actor.status !== "active") return NONE;

  // Defensive tenant check (see input doc comment above).
  if (actor.organizationId !== initiativeOrganizationId) return NONE;

  // 2. Active Org Admin -> implicit Owner-equivalent, short-circuit. Never
  // materialized as a stored grant (docs/V2-ACCESS-TEAMS-VISIBILITY.md §5).
  if (actor.accessLevel === "org_admin") {
    return {
      level: "owner",
      sources: [{ kind: "org_admin", level: "owner" }],
      sourceLabel: "Organization Admin",
      externallyCapped: false,
    };
  }

  // 3. Collect direct + team grants. Team sources listed first, direct last —
  // matches the approved label convention ("via Product + Direct", not
  // "via Direct + Product" — docs/V2-ACCESS-TEAMS-VISIBILITY.md §10).
  const sources: AccessSource[] = [];
  for (const tg of teamGrants) sources.push({ kind: "team", teamName: tg.teamName, level: tg.permission });
  if (directGrant) sources.push({ kind: "direct", level: directGrant.permission });

  if (sources.length === 0) return NONE;

  // 4. Highest valid permission wins.
  let level: PermissionLevel = sources.reduce<PermissionLevel>(
    (acc, s) => higherPermission(acc, s.level),
    "view",
  );

  // 6. External members never resolve above View, regardless of what their
  // direct/team sources would otherwise grant.
  const externallyCapped = actor.memberType === "external" && level !== "view";
  if (externallyCapped) level = "view";

  const sourceLabel = buildSourceLabel(sources, level, externallyCapped);
  return { level, sources, sourceLabel, externallyCapped };
}

function buildSourceLabel(sources: AccessSource[], level: PermissionLevel, externallyCapped: boolean): string {
  // When capped, the sources that actually produced the pre-cap highest level
  // aren't "at" `level` anymore (level is now "view") — fall back to naming
  // every contributing source instead of trying to re-derive the pre-cap rank.
  const contributing = externallyCapped ? sources : sources.filter((s) => s.level === level);
  const parts = contributing.map((s) => (s.kind === "direct" ? "Direct" : s.teamName!));
  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0] === "Direct") return "Direct";
  return `via ${parts.join(" + ")}`;
}

/** "{Level} — Direct", "{Level} via {Team}", "Owner — Organization Admin". */
export function formatAccessLabel(level: ResolvedLevel, sourceLabel: string): string {
  const label = LEVEL_LABELS[level];
  if (!sourceLabel) return label;
  return sourceLabel.startsWith("via ") ? `${label} ${sourceLabel}` : `${label} — ${sourceLabel}`;
}

export const LEVEL_LABELS: Record<ResolvedLevel, string> = {
  owner: "Owner",
  edit: "Edit",
  view: "View",
  none: "No Access",
};
