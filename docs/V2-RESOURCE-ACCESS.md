# V2 Resource Access / Permissions (Step 8C)

Status: **Implemented.** Builds on `docs/V2-ACCESS-TEAMS-VISIBILITY.md` (Step 7A, the approved MVP
model), `docs/V2-ORG-ADMIN-IA.md` (Step 8A), `docs/V2-USERS-TEAMS.md` (Step 8B, Users + Teams), and
`docs/V2-ARCHITECTURE.md` §11 (the shared-database safety rule this migration followed). This phase
adds the first real initiative-level authorization: `InitiativeAccess`, one canonical resolution
function, and server-side enforcement on the routes that matter most. The Organization Admin
Dashboard (8D), Dashboard Configuration (8E), and Roadmap Views remain unbuilt.

## 1. InitiativeAccess Model

```prisma
model InitiativeAccess {
  id           String     @id @default(cuid())
  initiativeId String
  initiative   Initiative @relation(fields: [initiativeId], references: [id], onDelete: Cascade)
  userId       String?
  user         User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  teamId       String?
  team         Team?      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  permission   String // owner | edit | view
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@unique([initiativeId, userId])
  @@unique([initiativeId, teamId])
}
```

One shared table for both direct and team grants, per `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §17 —
`UserInitiativeAccess`/`TeamInitiativeAccess` were explicitly evaluated and rejected there; nothing
in the implementation found a reason to revisit that. `sensitiveDataVisible` (mentioned as a
possible future column in Step 7A's proposed model) was deliberately **not** added — Step 8C
doesn't filter any sensitive field yet, so there's nothing for it to control; see §21.

## 2. Permission Levels

Exactly three, ranked `owner > edit > view`, plus the absence of a grant (`"none"`, never stored):

| Level | Meaning |
|---|---|
| `owner` | Full initiative management, including who else has access |
| `edit` | Can change planning content |
| `view` | Read-only |
| *(none)* | No valid grant reaches this user |

No `contribute`/`comment` tier, no granular per-action permissions — matches the approved MVP
scope exactly.

## 3. Resolution Algorithm

One function, `resolveInitiativeAccess()` (`src/lib/access/resolution.ts`), pure and DB-agnostic —
every route, page, and admin screen resolves access by calling it (directly, or via the DB-facing
wrapper in `initiativeAccess.ts`). Order, matching the approved algorithm exactly:

1. Inactive/disabled/archived user → `none`.
2. Active Organization Admin → `owner` (implicit, short-circuits everything below).
3. Otherwise, collect the direct grant (if any) and every grant from a team the user belongs to.
4. Highest of those wins.
5. No grant collected → `none`.
6. External member → never resolves above `view`, regardless of what step 4 produced.

No explicit deny rules exist or are planned — "no grant" already means no access; there's nothing
a deny rule would add for this org size.

## 4. Organization Admin Implicit Access

Never materialized as an `InitiativeAccess` row — evaluated first, inside the resolution function,
scoped to the admin's own organization (an Org Admin from a different org never short-circuits
into access on an initiative that isn't theirs; see §10). This keeps the grant table showing only
*actual* grants, exactly as Step 7A specified.

## 5. Team Inheritance

Every active member of a team with a grant inherits it — resolved dynamically on each request
(`initiativeAccess.ts` loads the user's current `TeamMember` rows and joins against
`InitiativeAccess` live), never copied onto individual users and never cached. Removing someone
from a team takes effect on their very next protected request — see §25 verification below and
`docs/V2-ORG-ADMIN-IA.md` §8/§25 for the same rule stated at the admin-workflow level.

## 6. Direct Grants

A specific person can also receive access independent of any team — useful for one-off exceptions
without inventing a team for a single person. The initiative creator's existing implicit ownership
was **formalized as a real `owner` grant** (per `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §19's
recommendation) — done two ways:

- **Backfill**: the two pre-existing initiatives each got an `owner` grant for their creator, via a
  one-time data script (not a schema migration — see §19).
- **Going forward**: `POST /api/initiatives` now creates the `owner` grant in the same
  `db.initiative.create()` call that creates the initiative itself.

## 7. External User Ceiling

Enforced in two places, never only in the UI:

- **Resolution** (`resolution.ts`): an external member's resolved level is capped at `view`
  regardless of what their direct/team sources would otherwise produce (`externallyCapped` is
  exposed on the result for the UI to note, though the level itself is already correct either way).
- **Mutation** (`mutations.ts`): `grantDirectAccess`/`changeGrantPermission` reject an
  Edit/Owner permission for an external grantee outright (`external_above_view`), and the "Add
  Access" picker doesn't render those options for an external candidate in the first place.

**Team grants are never capped at grant time** — a team can legitimately be granted Edit even if it
has external members (`grantTeamAccess` has no member-type check at all). The cap applies
per-member, at resolution: an internal member of that team gets the team's real Edit level: an
external member of the *same* team gets View. This was evaluated explicitly (per the brief's
instruction not to block a whole team over one external member) and is covered by
`mutations.test.ts`'s "does not cap a team grant at creation time" case.

## 8. Permission Source

Every resolved result carries a human-readable `sourceLabel`, built from exactly the sources that
produced the winning level (`resolution.ts`'s `buildSourceLabel`), formatted by
`formatAccessLabel()`:

| Scenario | Label |
|---|---|
| Organization Admin | `Owner — Organization Admin` |
| Single team | `Edit via Product Team` |
| Direct only | `View — Direct` |
| Multiple teams | `Edit via Product Team + PMO` |
| Team + direct, both at the winning level | `Edit via Product Team + Direct` |

No database jargon (`grantId`, `teamId`) ever reaches this text — confirmed by the 21
`resolution.test.ts` cases covering every combination above plus the revocation scenarios in §3
of that file.

## 9. Impact Preview

`previewGrantChange()` (`mutations.ts`) computes **before** (the grant's current effect,
unmodified) and **after** (the same resolution with that one grant either changed to a new
permission or removed) for every user the grant affects — one user for a direct grant, every
current team member for a team grant. Both sides are produced by the exact same
`resolveInitiativeAccess()` the rest of the system uses; there is no second, preview-specific
permission calculation.

`AccessImpactModal.tsx` (shared by the Admin Access page and Team Detail — see §14/§15) fetches
this preview via `POST /api/admin/access/grants/[grantId]/preview` before the admin can confirm a
change or revoke, and shows "No change" when a user has another source keeping them at the same
level (verified live — see §12).

**Last-Owner safeguard** (`docs/V2-ORG-ADMIN-IA.md` §20 "Removing an initiative's Owner"):
`changeGrantPermission`/`revokeGrant` block downgrading or removing an initiative's only remaining
direct `owner` grant, returning `409` with a plain message rather than the atomic "reassign in the
same action" UX the IA originally proposed — the same simplified shape as the last-active-org-admin
safeguard in `docs/V2-USERS-TEAMS.md`. Lower stakes than that one: an Organization Admin always has
implicit Owner-equivalent access regardless of this grant (§4), so this safeguard only protects the
*stored* grant, never actual access to the initiative. Verified live: attempting to revoke the sole
Owner grant on `planning portal` returned `409` with "This is the only Owner on this initiative —
grant Owner to someone else first," and the grant remained in place.

## 10. Tenant Isolation

Every mutation checks both sides of a grant against the acting admin's own organization before
writing anything:

- `grantDirectAccess`/`grantTeamAccess`: the target initiative *and* the grantee (user or team)
  must both belong to the actor's organization, or the mutation is rejected with `cross_tenant` —
  never silently scoped, never partially applied.
- `changeGrantPermission`/`revokeGrant`: the existing grant's initiative must belong to the actor's
  organization.
- `getResolvedAccess()`: an initiative in a different organization than the actor resolves
  identically to a **missing** initiative (`"not_found"`), never as a distinguishable "none" — see
  §17.

Covered by `mutations.test.ts`'s four cross-tenant cases (initiative-side and grantee-side, for
both direct and team grants) using a mocked `db`.

## 11. Disabled/Archived Behavior

A disabled or archived user resolves to `none` immediately (step 1 of the algorithm), regardless of
how many grants they hold — and those grants are **never deleted**. Re-enabling restores their
exact prior resolution with no rebuild, because nothing about their grants ever changed — only
`User.status`. This is the same "preserve, don't delete" principle `docs/V2-USERS-TEAMS.md` §3
already established for account status generally, now confirmed to apply through resource access
too.

## 12. Server Enforcement

Three guard functions (`src/lib/access/guards.ts`), each a thin wrapper over
`getResolvedAccess()` + `meetsMinimum()`:

- `requireInitiativeView/Edit/Owner` (pages) — `notFound()` for a missing/cross-org initiative,
  `redirect("/access-denied")` when the level is real but insufficient, otherwise returns the
  resolved access.
- `requireInitiativeApiAccess` (API routes) — same logic, returns a ready-to-return
  `NextResponse` (404 or 403) instead of calling Next navigation functions.

**Coverage, audited and applied systematically, not exhaustively rewritten blind:**

| Surface | Guard | Where |
|---|---|---|
| `workspace/layout.tsx` | View | Covers roadmap/features/epics/sprints/capacity/executive/stories/executive-print in one place — they all render inside it |
| Initiative dashboard | View | `initiatives/[id]/dashboard/page.tsx` |
| Guided intake page | View | Rendering; the actual write happens via the API route below, gated at Edit — a View-only user can still open "view intake answers" |
| Generation review page | View | `initiatives/[id]/review/page.tsx` |
| `GET/PATCH /api/initiatives/[id]` | View / Edit | |
| `GET/PATCH /api/initiatives/[id]/assumptions` | View / Edit | |
| `POST /api/initiatives/[id]/capabilities` | Edit | |
| `POST /api/initiatives/[id]/generate` | Edit | |
| `PATCH /api/initiatives/[id]/intake` | Edit | |
| `POST /api/initiatives/[id]/methodology` | Edit | |
| `POST /api/initiatives/[id]/recalculate` | Edit | |
| `GET /api/initiatives/[id]/validate` | View | |
| `POST /api/initiatives/[id]/sync/jira` | Edit | |
| `POST .../layers/[layerType]/lock` and `/unlock` | Edit | |
| `PATCH/DELETE /api/capabilities/[capId]` | Edit | Resolves `initiativeId` via `capability → intakeAnswerSet → initiative` |
| `POST /api/capabilities/[capId]/move-phase` | Edit | Same resolution path |
| `PATCH /api/artifacts/[artifactId]` | Edit | Resolves via `artifact → prototype → initiativeId` |
| `POST /api/artifacts/[artifactId]/move-sprint` | Edit | Already had the initiative id in scope |
| `/admin/access`, `/admin/access/[initiativeId]`, all `/api/admin/access/*` | `accessLevel === "org_admin"` | Separate, coarser gate — see §14 |

Owner-level enforcement exists in the guard functions (`requireInitiativeOwner`) but has no route
using it yet — nothing in Step 8C's scope requires an Owner-only page/route beyond the Access
management screens themselves, which are gated on `accessLevel` directly rather than per-initiative
Owner (an Org Admin manages access for every initiative in their org, not just ones they own).

## 13. User-Centric View

User Detail's "Resource Access" section (`docs/V2-USERS-TEAMS.md` §10, now real) shows every
initiative in the org this user currently resolves access to — **resolved**, not a raw grant dump
— via `listResolvedAccessForUser()`. Read-only, per the approved design (§19 of the brief
explicitly does not ask for add/change/revoke here — that lives in §14/§15 below).

## 14. Team-Centric View

Team Detail's "Initiative Access" section is now real
(`TeamInitiativeAccessPanel.tsx`) — add/change/revoke, through the **identical**
`/api/admin/access/*` routes the main Access page uses. Verified live: a grant added from the team
side appears when viewing the initiative from `/admin/access/[id]`, and vice versa — they are two
lenses over the same rows, never two systems (`docs/V2-ORG-ADMIN-IA.md` §16).

## 15. Initiative-Centric View

`ADMIN → Access` (`/admin/access`, an initiative picker) → `/admin/access/[initiativeId]` (Teams
section + Individuals section, Add Access flow, change/revoke with impact preview) is the one real
"who has access" screen. The initiative dashboard's header now carries a small "Who has access?"
link (visible to Organization Admins only) straight into this same page — confirmed live, no
second permission UI was built.

## 16. Dashboard Filtering

`listAuthorizedInitiativeIds()` is the canonical authorized-resource set — every initiative in the
org an active Org Admin can see is everything; a Standard User's set is the union of their direct
and team grants. Wired into every place that previously listed initiatives by raw `userId`
ownership:

- The Standard Dashboard (`loadGlobalDashboardData`) — the `authorizedInitiativeIds` seam Step 7B
  already built for this now receives a real list instead of `null`, and the underlying query no
  longer ANDs `userId` on top of it (an Org Admin's list legitimately includes initiatives they
  didn't create).
- `/initiatives` (the global list).
- The root layout's initiative switcher/nav list (`src/app/layout.tsx`) — feeds both `LeftNav` and
  `MobileNavDrawer`.

For the current org_admin demo user, the visible result is unchanged from before Step 8C (every
initiative still shows) — expected, since implicit admin access already covered everything; the
filtering is real, just not visibly different for this one account.

## 17. Unauthorized UX

- **Missing or cross-organization initiative** → Next's standard `notFound()` — verified live
  against a bogus id on the dashboard, a workspace page, `/admin/access/[id]`, and an API route:
  all four returned a clean 404 (page 404 or `{"error":"Not found."}` JSON), never a raw stack
  trace, never a hint that a same-named resource exists in another org.
- **Real initiative, insufficient level** → `redirect("/access-denied")`, a restrained page
  ("You no longer have access to this initiative," with links back to Dashboard and Initiatives) —
  verified live by visiting the page directly. See §20 for why the redirect itself couldn't be
  triggered end-to-end through the one real account in this prototype.

## 18. Audit Extension Points

No `AuditLog` table yet (deliberately deferred, matching `docs/V2-ORG-ADMIN-IA.md` §19's "capture
only, no UI" MVP scope). Every mutation that should eventually emit an event already goes through
exactly one of three functions, which is where that write would be added later without touching
call sites:

- `grantDirectAccess` / `grantTeamAccess` → **grant created**
- `changeGrantPermission` → **permission changed**
- `revokeGrant` → **grant revoked**

## 19. Migration

`prisma/migrations/20260823025022_add_initiative_access/` — reviewed before applying, per
`docs/V2-ARCHITECTURE.md` §11's shared-database rule:

- `CREATE TABLE "InitiativeAccess"`, two `CREATE UNIQUE INDEX` (`[initiativeId,userId]`,
  `[initiativeId,teamId]` — NULL-tolerant, so a team-only row never collides with a user-only row),
  three `ADD FOREIGN KEY` (all `ON DELETE CASCADE`, so deleting a team, user, or initiative cleans
  up its grants automatically rather than orphaning rows — the "team deletion should remove its
  grants safely" requirement from the brief).
- One hand-added `CHECK` constraint (`InitiativeAccess_grantee_xor`) enforcing exactly one of
  `userId`/`teamId` at the database level, not just in application code — verified live: an insert
  with both set is rejected, an insert with neither set is rejected.
- Zero `DROP`, `RENAME`, or destructive `ALTER` — confirmed both by generating the SQL via
  `prisma migrate diff` against the live database (not hand-typed) and by reading the applied
  result back via `information_schema`.
- Applied via `prisma migrate deploy`, using the session-pooler connection as a temporary
  `DIRECT_URL` override for that one command only — the same approach Step 8B established, `.env`
  itself untouched.
- **Data backfill (not a schema change)**: the two pre-existing initiatives' creators each got an
  `owner` `InitiativeAccess` row via a one-time script using the ordinary Prisma Client — a normal
  application-level write, not a migration.
- Verified before/after: 3 Organizations, 1 User, 2 Initiatives unchanged; 0 `Team` rows fabricated.

## 20. Known Auth Limitation

Everything in this document is real authorization against the real `User`/`Team`/`InitiativeAccess`
data — not a fake check. What it does **not** prove: the prototype still has exactly one
session-bound identity (`getCurrentUser()` always returns the same demo user, no Supabase Auth
wiring yet — unchanged from `docs/V2-ARCHITECTURE.md` §10). Concretely:

- The `accessLevel === "org_admin"` gate on `/admin/access*` and `/admin/users*` is real code, but
  has never been exercised against an actual second, lower-privileged session.
- The `redirect("/access-denied")` path could not be triggered end-to-end through the real account,
  because the last-admin safeguard (`docs/V2-USERS-TEAMS.md` §"safeguards") correctly *blocks*
  demoting the org's only Organization Admin — which is itself a successful safeguard
  verification, not a gap. The redirect logic is covered by: the destination page rendering
  correctly (verified live), the `meetsMinimum`/`resolveInitiativeAccess` unit tests (which fully
  exercise the "resolves to none" condition the redirect is gated on), and direct code review of
  `guards.ts`'s three-line branch.
- No fake users were created to manufacture a passing multi-user test — consistent with the
  instruction not to do so "unless safely done and explicitly documented," and nothing here needed
  one to verify honestly.

Real multi-user authentication remains a prerequisite for closing this gap, not something Step 8C
could responsibly simulate its way around.

## 21. Step 8D Dependencies

- The Organization Admin Dashboard (Step 8D) can now report real numbers for "access/admin issues
  requiring attention" — e.g. an initiative with no team holding Owner-equivalent access below the
  implicit admin level — since `listGrantsForInitiative`/`listAuthorizedInitiativeIds` already
  exist to query from.
- Dashboard Configuration (Step 8E) is unaffected by this phase and remains exactly where
  `docs/V2-STANDARD-DASHBOARD.md` §15 left it.
- `sensitiveDataVisible` (deferred in §1) should be added only when a specific widget/route needs
  to filter cost/capacity/risk data per viewer — not speculatively now.
- `AuditLog` (deferred in §18) should write through the three named mutation functions when built,
  not scattered across call sites.
