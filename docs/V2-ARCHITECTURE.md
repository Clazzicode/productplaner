# Prototype 2 Architecture

Status: **Documentation only.** Nothing in this document is implemented yet. No Prisma schema
changes, migrations, authentication, dashboards, or navigation were built in this phase. This
file is the source of truth that future phases will implement against, one phase at a time.

---

## 1. Purpose

Prototype 2 builds on the existing Guided Product Planning Platform (Prototype 1) by adding an
organizational layer around it: user access levels, working-role-driven experience defaults, an
organization admin surface, and (eventually) a platform-wide super admin console. The planning
engine itself — intake, generation, roadmap, features/epics/stories, sprints/releases, capacity,
cost, locking, traceability — is not being redesigned. Prototype 2 wraps a multi-tenant,
role-aware shell around that existing engine.

## 2. Existing Foundation (must be protected)

The following functionality already exists in the cloned codebase and must remain intact through
this and future phases:

- Guided qualification/intake (`QualifyingProfile`, `IntakeAnswerSet`)
- Initiative creation and lifecycle (`Initiative`)
- Deterministic planning/generation engine (`src/lib/generation/*`)
- Roadmap hierarchy: capabilities → features → epics → stories → acceptance criteria
  (`Capability`, `ArtifactLayer`)
- Sprint planning and release planning (`Sprint`, `Release`)
- Capacity calculations and cost forecasting (`src/lib/generation/capacityForecast.ts`,
  `cost.ts`)
- Planning health calculations (`src/lib/generation/health.ts`)
- Dependency logic (`CapabilityDependency`, `dependencyGraph.ts`)
- Layer locking / baselining (`LayerLock`, `Prototype.approvedBaselineJson`)
- Traceability between intake answers and generated artifacts (`ArtifactLayer.traceAnswerKeys`)
- Dashboard/workspace routes under `src/app/initiatives/[initiativeId]/workspace/*`
- Integration demonstration/stub functionality (`IntegrationProvider`, `IntegrationConnection`,
  `SyncConnection`, `src/lib/sync/*`)

None of this was modified in Step 2.

## 3. User Hierarchy

Three access levels, layered on top of the same planning data — not three separate apps:

| Level | Scope | Manages |
|---|---|---|
| **Standard User** | Own organization, own assigned work | Their own initiatives/work; read/write per permissions |
| **Organization Admin** | Own organization only | Users, roles, teams, invitations, org settings, integrations, org-level reporting, dashboard configuration |
| **Super Admin** | Entire platform, across organizations | Tenant provisioning, cross-org users, platform activity, account status, integration health, support, (later) billing |

Access level is a vertical axis: it determines *how much of the platform* a user can see and
administer. It is orthogonal to Working Role (Section 4), which determines *what a Standard
User's own dashboard emphasizes*.

Super Admin is intentionally **not** "Organization Admin plus more widgets" — see Section 7.

## 4. Working Roles

Working Role is a separate concept from Access Level. It only applies to how a user's own
experience is emphasized, not what they're authorized to do.

- **Product Management** — emphasis on roadmap, capabilities/features, product health,
  decisions, releases, outcomes.
- **Project Manager** — emphasis on schedules, milestones, dependencies, risks, capacity,
  delivery health.
- **Developer** — emphasis on assigned work, user stories, sprint work, blockers, dependencies,
  recent changes.

**Access Level vs Working Role:**
- Access Level answers "what is this account allowed to administer?" (Standard / Org Admin /
  Super Admin).
- Working Role answers "what does this person's day-to-day view emphasize?" (Product Management /
  Project Manager / Developer).
- All three working roles read from the same underlying planning data (`Initiative`,
  `Capability`, `ArtifactLayer`, `Sprint`, etc.) — working role changes emphasis and defaults, not
  data access.

**Open question for a later phase (not decided here):** whether an Organization Admin also picks
a personal working role for their own dashboard, separate from their admin capabilities. Flagging
this rather than deciding it now, since Step 2 is documentation-only.

**Step 4 update:** a temporary onboarding UI for organization setup and working-role selection now
exists (`/onboarding`, `/onboarding/role`). It captures organization name, company size, industry,
and working role, but persists **none** of them to the database yet — all four live only in a
browser cookie until V2's database is isolated (§11). See `docs/V2-ONBOARDING.md` for exactly
what's real vs. temporary.

Note: the existing `QualifyingProfile.role` field (`senior_pm | product_owner | business_analyst |
project_manager | scrum_master | founder_first_timer | executive_stakeholder`) is a **different,
pre-existing concept** — it's per-initiative intake/methodology metadata captured during guided
qualification, not a persistent account-level Working Role. The two must not be conflated. A
future phase introducing `User.workingRole` will need a new field; it should not repurpose
`QualifyingProfile.role`.

## 5. Organization Model

Target logical structure:

```
Platform
 └─ Organizations
     └─ Users
         └─ Roles (Access Level + Working Role)
             └─ Permissions (derived, see Section 6)

Organization
 ├─ Initiatives
 │   └─ Planning artifacts (capabilities, features, epics, stories, sprints, releases, ...)
 ├─ Teams / Users
 ├─ Integrations (org-level or initiative-level)
 └─ Settings
```

What already matches this shape today:
- `Organization` already sits at the tenant root, with `users[]` and `initiatives[]` relations.
- `User.organizationId` already binds every user to exactly one organization.
- `Initiative.organizationId` (plus `Initiative.userId` as creator/owner) already scopes planning
  work to a tenant and an owning user.
- `IntegrationConnection` already supports **both** organization-level and initiative-level scope
  today: `organizationId` is required, `initiativeId` is nullable ("nullable = org-wide
  connection" per the existing schema comment). This already matches the target integration
  scoping — no change needed for this piece later.

What doesn't exist yet: a `Team` model, a `Settings` model, and any `Role`/`Permission` tables
(see Section 6 for why permissions are deliberately not a database table yet).

## 6. Permissions Model (conceptual, intentionally simple)

Do not over-engineer. Proposed smallest viable approach:

- A user's authorization is a function of **Access Level** only: `permissions =
  f(accessLevel)`. Working Role never grants or restricts access — it only affects presentation
  (Section 8).
- Access Level lives as a single field on `User` (future addition — see Section 10), following the
  same "String constrained by TS union + Zod" convention already used throughout this schema
  (e.g. `Initiative.status`, `Capability.effortSize`) rather than introducing a native Postgres
  enum or new join tables.
- The permission set for each access level is a **static mapping in code** (e.g. a
  `PERMISSIONS_BY_ACCESS_LEVEL` constant), not a database-backed `Role`/`Permission`/
  `RolePermission` join structure. There is no per-user permission override table in this phase.
- Super Admin is **not** modeled as an `accessLevel` value on a tenant-scoped `User` row, because
  `User` is bound to exactly one `organizationId` and Super Admin must operate across
  organizations. It needs its own future design (e.g., a platform-level identity/flag outside the
  organization boundary) — explicitly deferred, not decided here.
- **Permissions must be enforced server-side** — in API routes / server actions — never only by
  hiding UI. This is a restatement of the given rule, not a new one.
- Escalate to a real `Permission`/database-backed model only if/when static role-based defaults
  prove insufficient. Starting simple avoids building an RBAC framework nobody needs yet.

## 7. Dashboard Model

Three distinct dashboard concepts, all reading from the same planning data, scoped differently:

- **Standard User Dashboard** — scoped to the user's own organization and (primarily) their own
  assigned work; widget emphasis defaults driven by Working Role (Section 4).
- **Organization Admin Dashboard** — scoped to the user's own organization, but with full
  visibility across that organization's users, initiatives, and teams, plus administrative
  controls (Section on Level 2 in the source instructions: employees, roles, teams, invitations,
  onboarding/offboarding, org settings, integrations, planning defaults, dashboard configuration,
  org-level reporting).
- **Super Admin Console** — scoped across organizations, platform-wide. This is architecturally a
  **separate console**, not the Organization Admin dashboard with extra widgets — different scope
  (cross-tenant), different concerns (provisioning, platform activity, account status, integration
  health, support, future billing), and should live in its own route/app boundary later.

## 8. Dashboard Configuration vs Permissions (critical distinction)

These are two different concepts and must stay that way as the system grows:

- **Permissions** = authorization. Whether a user is allowed to see certain data, access certain
  routes, perform certain actions, or modify certain resources. A security concern. Must be
  enforced server-side.
- **Dashboard Configuration** = presentation. Which widgets/information blocks appear on a given
  user's dashboard. Not a security boundary.

Example (from the source direction): an Organization Admin hiding the Cost Forecast widget from
Developers' dashboards is a **dashboard configuration** change. It does **not** mean Developers
lose permission to access cost information through other routes (e.g. a workspace page, an API
response, an export). If cost data should actually be restricted from Developers, that is a
**permissions** decision, made and enforced separately.

Rule for future implementation: dashboard configuration state must never be read as an
authorization signal, and permission checks must never depend on dashboard configuration.

## 9. Navigation Model (proposed, not implemented)

Application shell navigation, for future phases to build against:

```
PLAN
  Dashboard
  Initiatives
  Roadmap
  Planning Workspace
  Sprints & Releases

INTELLIGENCE
  Risks & Blockers
  Decisions
  Capacity & Cost
  Reports

ORGANIZATION
  Teams & Stakeholders
  Integrations
  Activity

ADMIN (only visible when the user's access level grants it)
  Users & Roles
  Organization
  Dashboard Configuration
  Settings
```

The ADMIN section's visibility is a permissions decision (Section 6), not a dashboard
configuration choice. Organization Admin's admin surface and Super Admin's console are expected to
be different routes/areas per Section 7, not one shared ADMIN section with conditional widgets.

## 10. Existing Schema Assessment

Full inventory of current models (`prisma/schema.prisma`): `Organization`, `User`,
`QualifyingProfile`, `Initiative`, `IntakeAnswerSet`, `Capability`, `CapabilityDependency`,
`Prototype`, `LayerLock`, `ArtifactLayer`, `Sprint`, `Release`, `SyncConnection`,
`IntegrationProvider`, `IntegrationConnection`, `IntegrationCapability`, `IntegrationSyncLog`,
`Team`, `TeamMember` (added Step 8B), **`InitiativeAccess`** (added Step 8C).

**Already supports the target architecture (reusable as-is):**
- `Organization` as the tenant root, with `users[]` / `initiatives[]` relations.
- `User.organizationId` — single-organization membership, which matches the "smallest viable"
  direction (no many-to-many org membership needed yet).
- `Initiative.organizationId` + `Initiative.userId` — tenant- and owner-scoped planning work.
- `IntegrationConnection`'s dual org-level/initiative-level scoping (see Section 5).

**Implemented at Step 8B (`docs/V2-USERS-TEAMS.md`):**
- `User.accessLevel` (`standard_user | org_admin`) — real, and now the first field with genuine
  server-side enforcement (`/api/admin/*` routes check it; see `docs/V2-USERS-TEAMS.md` §15 for
  the exact, narrow scope of what that enforcement covers today).
- `User.workingRole` (`product_management | project_manager | developer | null`) — nullable, no
  fabricated default; still distinct from `QualifyingProfile.role` as originally specified.
- `User.memberType` (`internal | external`) and `User.status` (`active | disabled | archived`).
- `Team` and `TeamMember` (`User` ↔ `Team`, unique per pair) — flat, no nesting, no team roles.

**Implemented at Step 8C (`docs/V2-RESOURCE-ACCESS.md`):**
- `InitiativeAccess` (`initiativeId`, `userId?`, `teamId?`, `permission: owner|edit|view`) — the
  shared direct/team grant table, with a database `CHECK` constraint enforcing exactly one grantee
  and two NULL-tolerant unique indexes preventing duplicate grants.
- One canonical permission-resolution function (`src/lib/access/resolution.ts`) that every route,
  page, and admin screen now calls — real server-side enforcement (not just UI hiding) on the
  initiative dashboard, the entire workspace route tree, and the initiative-scoped API routes that
  matter most (see `docs/V2-RESOURCE-ACCESS.md` §12 for the full coverage table).
- `ADMIN → Access`, plus real Resource Access sections on User Detail (read-only, resolved) and
  Team Detail (writable, same underlying grants).

**Implemented at Step 8E (`docs/V2-DASHBOARD-CONFIGURATION.md`):**
- `DashboardConfiguration` (`organizationId`, `workingRole`, `widgetId`, `visible`) — presentation
  only, per Section 8's distinction; no `userId`, `teamId`, or permission level, and never consulted
  as an authorization signal. Sparse storage: a row exists only when its value differs from
  `widgetRegistry.ts`'s code-level default.
- `ADMIN → Dashboard Configuration` — per-Working-Role widget visibility toggles, wired into
  `/home`'s widget-order resolution as a pure filter step on top of the existing, unchanged
  authorization/ordering logic.

**Gaps — still nothing currently exists for:**
- **No real authentication linkage.** `User` has no identity-provider field (e.g. a Supabase auth
  user id) and no password/session data. The current implementation
  (`src/lib/auth/session.ts`) auto-creates and reuses a single hardcoded demo user/organization
  (`demo@planning.local` / "Demo Organization") — there is no login, and no way today to have more
  than one distinguishable session. The Supabase Auth-related keys present in `.env`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `NEXT_PUBLIC_SUPABASE_JWKS_URL`) are not referenced anywhere in `src/` today — provisioned but
  unused. This is why both Step 8B's `accessLevel` check and Step 8C's initiative-level
  authorization, while genuinely real, have never been exercised against an actual second user —
  see `docs/V2-RESOURCE-ACCESS.md` §20 for exactly what that does and doesn't prove.
- **No audit/activity log model.** The proposed "Activity" nav item and Super Admin's "platform
  activity" have no backing table.
- **No cross-organization concept for Super Admin.** There is currently exactly one implicit
  organization, so nothing today prevents or scopes cross-tenant queries — but there's also no
  representation of a platform-operator identity distinct from a tenant-scoped `User` row.
- **No `Organization.status`.** Only `User.status` was added at Step 8B — org-level
  provisioning/offboarding state remains a future addition if it's ever needed.

**Likely future additions (listed only — not implemented):**
- A Super Admin representation that is not a tenant-scoped `User` row (design deferred).
- An `ActivityLog`/`AuditLog` model.
- An identity-provider linkage field on `User` (e.g. `supabaseUserId`) once Supabase Auth is
  actually wired in.
- A code-level permissions mapping (Section 6) — not a database table, unless a future phase
  finds the static approach insufficient.

## 11. Shared Database Model (corrected at Step 8B)

**Prototype 2 is not a separate product, tenant, or deployment — it is a local development
workspace for the next version of the same application, deliberately sharing Prototype 1's
Supabase/Postgres database.** The intended product strategy: one product, one eventual Supabase
project, one eventual GitHub repository, with V2 developed as a separate local
workspace/branch and merged/deployed only when explicitly decided. This section previously
described physical database isolation as a blocking prerequisite; that framing was **corrected**
at Step 8B once this intent was clarified, and is retained below only as historical context.

**Historical context — why isolation was originally considered (Steps 2–8B-0):** Prototype 2 was
cloned from Prototype 1 in Step 1 with an unchanged `.env`, so both pointed at the same
`DATABASE_URL`/`DIRECT_URL` (same Supabase project, `hzsrdpbdbfqaicropsha`) from the start. Early
phases (through Step 8A) assumed V2 would eventually become its own isolated environment before
any schema change, and Step 8B initially halted for exactly that reason — see the now-superseded
requirement this replaced. A brief attempt at Step 8B-0 to provision a genuinely separate Supabase
project for V2 was **cancelled by the user**: V2 was never meant to be a second deployed
environment, only a safe local copy to redesign against before intentionally pushing/merging.

**Current model — shared database, controlled migrations:** because a separate local folder
protects application *code* but not the *database*, any Prisma migration run from
`guided-planning-platform-v2` immediately affects the same Supabase database Prototype 1 depends
on. From Step 8B onward, database changes are permitted only when they are:

- **Additive** — new tables/columns, never removing or renaming existing ones in the same change.
- **Backward-compatible** — the currently-deployed application (Prototype 1) must keep working
  unmodified against the upgraded schema; it simply doesn't read the new columns/tables.
- **Non-destructive** — no `DROP`, no type replacement, no required column added without a safe
  default, no relationship change that could invalidate existing rows.
- **Explicitly reviewed before execution** — every proposed migration's SQL is generated and
  inspected first (see `docs/V2-USERS-TEAMS.md` for the Step 8B example), with the user's explicit
  approval required before it's applied to the shared database. No migration is ever run silently.

**Git/deployment control (the other half of the safety strategy):** code changes are isolated by
keeping V2's work in a separate branch of the same eventual GitHub repository (Prototype 1's
`master` stays the recoverable, currently-deployed version; V2 work happens on its own branch)
rather than by a separate database. See `docs/V2-USERS-TEAMS.md` "Git Strategy" for the concrete
recommendation as of Step 8B — nothing about branches/remotes was changed without explicit
approval.

## 12. Future Architecture Boundaries

This document establishes the structure that the following future phases will implement against.
None of them were started in Step 2:

- Authentication
- Onboarding — **partially started in Step 4**: a temporary UI exists for organization setup
  (name, company size, industry) and working-role selection (`docs/V2-ONBOARDING.md`). All four
  values are cookie-only — zero database writes. Real persistence still waits on Step 3B/5+ (auth +
  schema changes on the isolated V2 database).
- Application shell — **built, Step 6A/6B/6C**
- Standard dashboard — **built, Step 7B** (`docs/V2-STANDARD-DASHBOARD.md`)
- Organization admin — **information architecture designed (Step 8A), Users + Teams built
  (Step 8B), Resource Access built (Step 8C), Admin Dashboard built (Step 8D,
  `docs/V2-ORG-ADMIN-DASHBOARD.md`), Dashboard Configuration built (Step 8E,
  `docs/V2-DASHBOARD-CONFIGURATION.md`)**
- Roadmap (combined timeline/milestones/connections view, per the given direction — built on top
  of, not replacing, the existing roadmap generation logic)
- Planning workspace
- Integrations (priority order per the given direction: Jira, then Azure DevOps; platform remains
  system of record)
- Settings
- Reports
- Super admin
