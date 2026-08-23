# V2 Access, Teams & Visibility Architecture (Step 7A)

Status: **Documentation only.** No Prisma schema changes, no migrations, no application code
changes, no database writes were made in this phase. This document extends
`docs/V2-ARCHITECTURE.md` (Step 2) and `docs/V2-APPLICATION-SHELL-BLUEPRINT.md` (Step 6A/6B) with
the access, teams, resource-permission, and visibility model those documents deliberately deferred.
It targets organizations of roughly **10–50 users**, and is written so an Organization Admin can
understand and manage it without enterprise-RBAC complexity.

---

## 1. Authorization Principles

Permissions must be enforced **server-side**, on every protected route/query, never only by
hiding UI — restated from `docs/V2-ARCHITECTURE.md` §6, still the governing rule.

This document adds a **third axis** to the two already established in `V2-ARCHITECTURE.md`,
and keeps a fourth concept explicitly outside authorization entirely:

| Axis | Answers | Security-relevant? | Defined in |
|---|---|---|---|
| **Access Level** | What can this account administer platform/org-wide? | Yes | `V2-ARCHITECTURE.md` §3 (unchanged) |
| **Working Role** | What does this person's day-to-day view emphasize? | **No** | `V2-ARCHITECTURE.md` §4 (unchanged) |
| **Resource Access** *(new, this doc)* | Which specific initiatives can this user see/edit, and how? | Yes | §4–§6 below |
| **Member Type** *(new, this doc)* | Is this an internal employee or an external/client guest? | Yes (as a visibility filter) | §7, §9 below |
| Dashboard Configuration | Which authorized widgets are displayed? | **No** | `V2-ARCHITECTURE.md` §8 (unchanged), §12–13 below |

Conceptually: `permissions = f(accessLevel, resourceAccess, memberType)`. Working Role and
Dashboard Configuration are intentionally excluded from that function — they are presentation
only and must never gate data access.

---

## 2. Access Level vs Working Role

No change from `V2-ARCHITECTURE.md` §3–§4 — restated here because everything below builds on it:

- **Access Level**: Standard User / Organization Admin / Super Admin (Super Admin kept
  architecturally separate, cross-org, design deferred — unchanged).
- **Working Role**: Product Management / Project Manager / Developer — affects dashboard emphasis
  and defaults only.
- Working Role must **never** be read by an authorization check. This document does not change
  that rule; it only adds Resource Access and Member Type alongside it.

---

## 3. Team Model

**Purpose:** the scalable way to grant many users access to many initiatives without hand-granting
every user every initiative individually.

- A Team belongs to exactly one Organization (matches `User.organizationId` — no cross-org teams).
- A user can belong to **multiple** teams (many-to-many).
- Teams are created, renamed, and have members added/removed **only by an Organization Admin**.
- A team carries no inherent permissions by itself — it only matters once it's been granted access
  to one or more initiatives (§4–§5). A team with zero grants is inert, and that's fine.
- Removing a user from a team **immediately** removes any access that membership was the source
  of, unless another valid grant still covers them (§6).
- **Not for MVP:** nested/hierarchical teams (a team containing another team), and in-team roles
  (e.g. "team lead" with elevated rights over teammates). Both are unnecessary complexity at
  10–50 users — see §18.

---

## 4. Resource Permission Model

Evaluated against Owner / Manager / Edit / Contribute / Comment / View / No Access, per the
request — **recommend collapsing to three real levels**, not seven:

| Level | Can do | Notes |
|---|---|---|
| **Owner** | Everything Edit can, plus manage who else has access, rename/archive/delete the initiative, reassign ownership | Exactly one Owner per initiative; maps directly onto the existing `Initiative.userId` (creator) field — no schema conflict, just formalizing what already exists |
| **Edit** | Read and modify planning content (intake, roadmap, capacity, sprints, etc.), subject to layer-lock state | Cannot manage access grants, cannot delete/archive |
| **View** | Read-only, everything Edit can see | No mutations |
| *(No Access)* | Nothing | Not a real grant — it's the absence of any grant. Initiative is excluded from lists; direct URL access is rejected server-side |

**Dropped, and why:**
- **Manager** — redundant with Owner at this org size; don't need a distinct "can manage access
  but isn't the creator" tier for 10–50 users.
- **Contribute / Comment** — the product has no commenting system today. Collapsing into
  Edit/View avoids inventing a permission level with nothing to attach it to. Revisit only if a
  comment feature ships later (§19 Phase 2).

**Owner is always a direct grant to exactly one user**, never held by a team — "who owns this
initiative" must always be answerable with one name, not a group. Team grants and additional
direct grants are Edit or View only.

---

## 5. Permission Resolution Rules

Resolving "what access does User X have to Initiative Y," in order:

1. **Access-Level short-circuit.** Organization Admin has implicit **Owner-equivalent** access to
   every initiative inside their own organization (an access-level right, not a stored grant —
   it doesn't appear as a row in the grant table, it's evaluated first). Super Admin has the
   equivalent across organizations, for support/provisioning (design of Super Admin itself
   remains deferred per `V2-ARCHITECTURE.md` §6).
2. Otherwise, collect every applicable grant: the user's **direct** grant on the initiative (if
   any), plus grants from **every team** the user belongs to that has been granted access to that
   initiative.
3. Effective level = the **highest** of those (Owner > Edit > View). Grants are **additive,
   highest-wins** — never intersected or narrowed. This is the simplest rule for a non-technical
   admin to reason about: "if any path gives you Edit, you have Edit," not "the most restrictive
   path wins."
4. No grant from any path → **No Access**.
5. **Member Type is applied after** the level is resolved — it filters which fields/widgets are
   visible within whatever level was resolved (§7, §9). It never changes the level itself.

**Downgrade behavior:** downgrading one grant (e.g. a direct Edit → View) does **not** reduce
effective access if another active path (a team grant, or Org Admin status) still supplies a
higher level. A future admin UI should surface a user's *other* active grants when downgrading,
so the admin isn't surprised the change had no visible effect.

---

## 6. Revocation Behavior

| Scenario | Expected behavior |
|---|---|
| **User removed from a team** | Immediately loses any access that membership was the source of, unless a direct grant or another team's grant still covers that initiative. |
| **Direct access removed** | Immediately loses that grant; retains access only if a team grant remains. |
| **Edit downgraded to View** | Retains View; server rejects the next mutation attempt regardless of what the client UI still shows. In-flight unsaved client state is a UX concern, out of scope here. |
| **User disabled** | All access revoked instantly, across every initiative, regardless of grant source — treated the same as "user not found" by every authorization check. Existing sessions must be invalidated, not just blocked at next login. |
| **External user removed** | Same as disabled, plus: actually remove/deactivate their grant rows (don't leave orphaned externals visible in "who has access" views). Their historical audit trail (§16) is retained by id/email snapshot, not a live join to the now-gone user row. |

**Governing rule for all five:** access must be **re-evaluated server-side on the next protected
request**, not cached in a long-lived session claim without revalidation, and never enforced only
by hiding UI elements.

---

## 7. Internal vs External Users

**Recommend supporting both**, as a `memberType` on the existing `User` model (internal, default;
external/guest) — not a parallel identity system, not a separate portal app.

External/Guest rules, chosen to be the simplest thing a non-technical admin can reason about:

- Still belongs to exactly one Organization (same relation as today).
- Can only ever be granted **View** — never Edit, never Owner. "Clients can look, not touch."
- Only gets access via explicit direct or team grants on specific initiatives — never the implicit
  org-wide visibility Org Admin has.
- Sensitive fields (§9) are stripped regardless of the resolved level — the `memberType` flag
  removes data that an internal View grant would otherwise include; it is not a second permission
  level.
- A dedicated "Client Portal" application is **not** MVP (§20 Enterprise Later) — externals use the
  same shell, filtered.

---

## 8. Initiative Permission Boundary

**Yes — Initiative is the primary (and for MVP, only) permission boundary.** This follows directly
from the existing schema: every planning artifact already hangs off `Initiative` — via
`Prototype` → `ArtifactLayer`/`Sprint`/`Release`, or via `IntakeAnswerSet` → `Capability`. None of
Roadmap, Features, Epics, Stories, Sprints, or Capacity have an independent identity today that
would need its own grant; they're rows scoped by `prototypeId`/`intakeAnswerSetId` back to one
Initiative.

**Inherits automatically, no separate configuration, ever:**
Roadmap · Features/Epics/Stories (the `ArtifactLayer` tree) · Sprints & Releases · Planning
Workspace · Capacity & Cost · Executive View.

Each inherits the resolved Initiative-level grant directly (Edit/View), filtered further only by
the Member Type / sensitive-data flag (§9) — never by a separate per-child grant. Configuring
access per child object is explicitly rejected: it isn't required by the data model, and it would
make the admin experience unpredictable at this org size.

**Integrations note:** `IntegrationConnection.initiativeId` is already nullable in the existing
schema (org-wide vs. initiative-scoped). Org-wide connections follow Access Level (Org Admin);
initiative-scoped connections follow that initiative's grant like everything else. No new rule
needed — the existing shape already matches.

---

## 9. Sensitive Information Visibility

**Recommend one flag, not dozens.** A single `sensitiveDataVisible` flag, evaluated as a filter
*after* the Owner/Edit/View level is resolved:

- Defaults to **true** for all Internal members (Standard User or Org Admin, at any grant level).
- Defaults to **false** for all External members.
- Can be explicitly overridden **per grant** by an Org Admin (e.g. a client who genuinely needs
  budget visibility) — an explicit, rare override, not a default.

**Covered by that one flag:** Cost/Budget (`Initiative.budget`, `averageHourlyRate`, generated
cost forecasts), Capacity (staffing, utilization, velocity assumptions), Internal Risks, Internal
Decisions/notes.

Deliberately **not** split into per-field flags (a separate "can see budget" vs. "can see risks"
flag) for MVP — one bucket is enough until real usage shows a need to split it (§19 Phase 2).

---

## 10. Roadmap / Roadmap View Model

**Recommend Approach B (one master plan, multiple views) — reject Approach A (duplicated
roadmaps).**

Why A is rejected: the generation engine produces one deterministic plan from one
`IntakeAnswerSet`; there is no mechanism to generate N divergent roadmaps from one intake, and
maintaining N manual copies guarantees drift plus defeats the existing living-plan recalculation
behavior. It also directly conflicts with "avoid making admins configure things repeatedly."

**Recommendation:** one Initiative = one roadmap (today's `Prototype`/`ArtifactLayer` tree,
unchanged) + a small, fixed set of named **Roadmap Views** — presentation filters over the same
data, not copies:

| View | Shows | Hides |
|---|---|---|
| Product View | Capabilities/features/epics, health, decisions | Sprint-level task detail, cost |
| Engineering View | Full `ArtifactLayer` tree incl. stories, dependencies, sprints | Budget/financials |
| Leadership View | High-level roadmap/phases, health, cost/budget, risk | Granular story-level detail |
| Client View | Whatever Member-Type + sensitive-data filtering already produces (§7, §9) | N/A — not a 5th concept, it's the natural output of External filtering applied to any other view |

For MVP, these four are **fixed, code-level presets** — same pattern as the existing
`PERMISSIONS_BY_ACCESS_LEVEL` static mapping — not admin-configurable per org (that's §19 Phase 2).

**Explicit distinction requested:**
- *A different view of the same initiative* = same `Initiative`/`Prototype`/`ArtifactLayer` rows,
  same permission grant, a different field/section filter at render/query time. No new
  authorization boundary, no separate grant needed.
- *A completely separate initiative* = a genuinely distinct `Initiative` row, its own intake, its
  own generation run, its own grants from scratch. Only appropriate when the underlying work is
  actually different — never as a way to show different audiences different slices of one plan.

---

## 11. Client Visibility

A client/external user sees the **Client View** lens (§10) of only the initiatives they've been
explicitly granted (§5–§6), always at **View** level (§4, §7), with the sensitive-data flag off by
default (§9). No external user ever sees another client's initiative, the org's team roster,
member list, or any admin surface — those are Access-Level gated (Standard User / Org Admin only),
orthogonal to initiative grants.

---

## 12. Dashboard Authorization Rules

Explicit hierarchy, extending `V2-ARCHITECTURE.md` §8 with the resource-access axis:

```
Authorization  →  Dashboard Configuration  →  Working Role
```

- **Authorization** (Access Level + Resource Access + Member Type) determines what data **can be
  retrieved at all**. The only layer that is a security boundary; enforced server-side on every
  request.
- **Dashboard Configuration** determines which of the *already-authorized* widgets are displayed.
  An Org Admin hiding the Cost Forecast widget from Developers' dashboards is presentation only —
  it does not change whether Developers can reach cost data through another route.
- **Working Role** determines default emphasis/ordering of whatever Dashboard Configuration made
  available. Pure presentation — never a data-availability decision.

**Hard rule:** Working Role must never override or substitute for an authorization check.
Dashboard Configuration state must never be read as an authorization signal.

---

## 13. Dashboard Configuration Separation

`DashboardConfiguration` remains its own future model (org-scoped, later possibly role- or
team-scoped), entirely independent of the grant tables (`TeamMember`, `InitiativeAccess`). A
permission check must never query `DashboardConfiguration`. Rendering a dashboard must always run
data queries through the authorization layer first, then apply configuration as a display filter —
never skip authorization because "it's just a widget."

---

## 14. Organization Admin Workflows

**Users:** list users (org-scoped) · enable/disable (instant revocation everywhere, §6) · change
Access Level (Standard User ↔ Organization Admin — Super Admin is out of band, unchanged from
`V2-ARCHITECTURE.md` §6) · set Member Type (internal/external). Working Role is normally
self-selected during onboarding; admin override is a Phase 2 nicety.

**Teams:** create (name only for MVP) · rename · add/remove users · delete (cascades: the team's
grants disappear, members lose inherited access unless another grant covers them, per §6).

**Resource Access:** choose an initiative · grant team access (team + Edit or View — never Owner,
§4) · grant individual access (user + level, including reassigning Owner) · downgrade/revoke a
specific grant · view "who has access" for that initiative, showing **why** each person has it
(which grant or team is the source) — necessary for the admin to trust the highest-wins rule (§5).

**Dashboard Configuration:** configure widget visibility by Working Role (MVP); by team is a
Phase 2 option only if role-level proves too coarse.

---

## 15. Access Management UX

Three entry points were evaluated: User → Teams/Resource Access, Team → Members/Resources,
Initiative → Who Has Access.

**Recommendation: all three read and write the same underlying grant tables** — different query
directions into identical data (`TeamMember` and `InitiativeAccess`), never three separate stores.
This is required for the highest-wins resolution (§5) to stay correct: if the three views kept
separate records, they would drift, and the "predictable to a non-technical admin" requirement
would break immediately.

---

## 16. Audit Requirements

Minimum events to capture (not implemented in this phase):

- User added to / removed from a team
- Initiative access granted (team or direct) — level, grantee, grantor, timestamp
- Initiative access downgraded — from-level → to-level
- Initiative access revoked
- User Access Level changed (Standard ↔ Org Admin)
- User disabled / re-enabled
- External user removed
- Team created / deleted
- Initiative ownership reassigned

Each event: actor, target, initiative/team context, old value → new value, timestamp. Retained by
id/email snapshot even after the target user is later deleted or disabled — consistent with the
retention note in §6.

---

## 17. Proposed Future Data Model

**Prisma is not modified in this phase.** Proposed additions only, following the schema's existing
conventions (cuid ids, String-encoded values validated by TS union + Zod, camelCase,
`organizationId` scoping):

- `User.accessLevel` (`standard_user | org_admin`) — already recommended in `V2-ARCHITECTURE.md`
  §10, restated as a dependency here.
- `User.status` (`active | disabled`, default `active`) — already flagged as a gap in
  `V2-ARCHITECTURE.md` §10.
- `User.workingRole` — already recommended in `V2-ARCHITECTURE.md` §10, unchanged.
- `User.memberType` (`internal | external`, default `internal`) — **new in this doc**.
- `Team` (id, organizationId → Organization, name, createdAt).
- `TeamMember` (id, teamId → Team, userId → User, createdAt; unique on `[teamId, userId]`).
- `InitiativeAccess` (id, initiativeId → Initiative, level: `owner | edit | view`, granteeType:
  `user | team`, granteeUserId?, granteeTeamId?, grantedByUserId, sensitiveDataVisible: Boolean
  default false, createdAt) — one table for both direct and team grants; a partial-unique
  constraint keeps each (initiative, team) or (initiative, user) pair to one row.
- `AuditLog` (id, organizationId, actorUserId, eventType, targetType, targetId, fromValue,
  toValue, metadataJson, createdAt) — already flagged as a gap in `V2-ARCHITECTURE.md` §10,
  restated with the event list from §16.

**Explicitly challenged and rejected:**
- A `Role`/`Permission`/`RolePermission` RBAC join structure — rejected, consistent with
  `V2-ARCHITECTURE.md` §6's existing "static mapping in code" decision; nothing here needs
  per-user custom permission sets.
- A separate `ClientPortalUser` model — rejected; External is a `memberType` flag on `User` (§7),
  not a parallel identity system.
- Per-child-object grant tables (`RoadmapAccess`, `SprintAccess`, etc.) — rejected per §8.
- A dedicated `RoadmapView` database model — rejected for MVP; the four views (§10) are code-level
  presets. Promote to a real model only if views become admin-configurable (§19 Phase 2).
- A `SensitiveDataOverride` model — folded into a boolean column on `InitiativeAccess` instead of a
  separate table (§9).
- A `TeamRole` concept — rejected for MVP (§3).

---

## 18. MVP / Phase 2 / Enterprise Split

**MVP (required for the first client-ready version, 10–50 users):**
- `User.accessLevel`, `User.status`, `User.memberType`
- `Team` + `TeamMember` (flat, no nesting, no team roles)
- `InitiativeAccess` (Owner/Edit/View, direct + team grants, highest-wins resolution, §5)
- Server-side enforcement on every protected route, from the first grant onward
- Single sensitive-data visibility flag (§9), defaulted by member type
- Four fixed Roadmap View presets (§10), code-level
- Org Admin workflows: Users, Teams, Resource Access, Dashboard Configuration by Working Role
- Revocation correctness (§6) — re-evaluated server-side, not just hidden in UI

**Phase 2 (useful, not required initially):**
- Admin-configurable Roadmap Views beyond the four presets
- Dashboard Configuration by team, not only by Working Role
- Team roles (e.g. team lead), if a real need emerges
- Splitting the single sensitive-data flag into a couple of coarse categories
- "Why does this person have access" rollups with richer search/filtering
- Browsable Audit Log UI (events captured from MVP per §16; the screen can wait)
- Bulk operations (bulk-add users to a team, bulk-grant a team across many initiatives)

**Enterprise Later (not needed at 10–50 users, do not build now):**
- Database-backed custom RBAC / per-user permission overrides beyond Owner/Edit/View
- Nested/hierarchical teams, cross-team management structures
- SSO/SCIM-driven provisioning and team sync
- Dozens of individual field-level visibility flags
- Multi-organization membership for a single user
- A genuinely separate Client Portal application/shell
- Approval workflows for access grants (second-admin sign-off)
- Cross-organization resource sharing

---

## 19. Compatibility With Existing V2 Architecture

- Access Level is unchanged from `V2-ARCHITECTURE.md` §3.
- Working Role is unchanged from §4 — still presentation-only. This document adds Resource Access
  and Member Type as new axes alongside it, without altering either existing axis.
- The Permissions-vs-Dashboard-Configuration separation from §8 is preserved and extended (§12–13
  here).
- The Shell Blueprint's nav groups (ORGANIZATION → Teams & Stakeholders; ADMIN → Users & Roles,
  Organization, Dashboard Configuration) already anticipated exactly this work — this document
  makes those destinations buildable; it does not change the nav structure itself.
- The Database Isolation Requirement (`V2-ARCHITECTURE.md` §11) still fully blocks implementation
  against the current shared Supabase database — restated as a hard prerequisite, not relaxed.
- The existing `Initiative.userId` (creator) maps directly onto the new Owner grant (§4) — no
  conflict, just formalizing what already exists as the default Owner grant.

---

## 20. Step 7B Dashboard Constraints

Forward-looking constraints for whoever builds the Standard Dashboard next (not built now):

- Every dashboard query must resolve Resource Access + Member Type first; Dashboard Configuration
  only decides which already-authorized widgets render.
- Cost/Capacity/Risk/Decision widgets must check the sensitive-data flag (§9) per viewer, not
  per-org.
- No dashboard — including Org Admin rollups — may aggregate across initiatives the viewer lacks
  at least View on. Org Admin's implicit access (§5) must go through the same resolution function,
  not a separate "admin bypass" query path.
- Dashboard Configuration may only choose among already-authorized widgets; it must never be able
  to force-render one the viewer isn't authorized for.

---

## 21. Step 8 Implementation Recommendations

Sequencing suggestion for the eventual build phase (not started):

1. Database isolation (`V2-ARCHITECTURE.md` §11) must land first — nothing below can migrate
   before it.
2. Add `User.accessLevel`, `User.status`, `User.memberType` (small, additive fields).
3. Add `Team`, `TeamMember`.
4. Add `InitiativeAccess` plus the resolution function (§5) as one server-side authorization
   module reused by every route, server action, and dashboard query — not duplicated per call
   site.
5. Wire the ADMIN nav's "Users & Roles" / "Organization" and ORGANIZATION nav's "Teams &
   Stakeholders" (currently disabled placeholders per the Shell Blueprint) to real data.
6. Build the four Roadmap View presets as a read-side filter over existing `ArtifactLayer`
   queries — no generation-engine changes.
7. Add `AuditLog` writes alongside the grant-mutation code from step 4.
8. Dashboard Configuration model and the Standard Dashboard itself (Step 7B) build on top of
   steps 2–4, never before them.
