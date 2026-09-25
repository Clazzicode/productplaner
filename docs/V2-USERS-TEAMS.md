# V2 Users + Teams Foundation (Step 8B)

Status: **Implemented.** Builds on `docs/V2-ARCHITECTURE.md`, `docs/V2-ACCESS-TEAMS-VISIBILITY.md`
(Step 7A), and `docs/V2-ORG-ADMIN-IA.md` (Step 8A). This phase adds the first real, persisted
Organization Admin management layer — Users and Teams — against the shared Supabase database used
by both prototypes (see `docs/V2-ARCHITECTURE.md` §11 for the corrected shared-database model).
Initiative resource access (`InitiativeAccess`), the Organization Admin Dashboard, and Dashboard
Configuration are still not built — Steps 8C/8D/8E.

## 1. Applied Schema Changes

Migration `prisma/migrations/20260823003701_add_user_admin_fields_and_teams/`, reviewed before
apply (see `docs/V2-ARCHITECTURE.md` §11's migration-review requirement) and applied via
`prisma migrate deploy`:

```prisma
model User {
  // ...existing fields unchanged...
  accessLevel     String              @default("org_admin") // standard_user | org_admin
  workingRole     String?             // product_management | project_manager | developer
  memberType      String              @default("internal") // internal | external
  status          String              @default("active") // active | disabled | archived
  teamMemberships TeamMember[]
}

model Team {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  description    String       @default("")
  members        TeamMember[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([teamId, userId])
}
```

## 2. Migration Safety

Purely additive: 4 `ALTER TABLE ... ADD COLUMN`, 2 `CREATE TABLE`, 1 `CREATE UNIQUE INDEX`, 3
`ADD FOREIGN KEY` constraints. No `DROP`, no `RENAME`, no type changes. Verified before and after
via read-only introspection of the live database:

| | Before | After |
|---|---|---|
| Organizations | 3 | 3 (unchanged) |
| Users | 1 | 1 (unchanged) |
| Initiatives | 2 | 2 (unchanged) |
| Teams | table didn't exist | 0 rows (none fabricated) |

The one existing `User` row was backfilled to `accessLevel = org_admin`, `memberType = internal`,
`status = active`, `workingRole = NULL` — see §4–5 for why those specific defaults, not a generic
choice.

## 3. User Lifecycle

Three states, all reversible, none of them deletion:

| State | Meaning | Preserves |
|---|---|---|
| `active` | Normal | — |
| `disabled` | Temporarily unusable | Team memberships and (once Step 8C exists) resource grants — re-enable restores everything with no rebuild |
| `archived` | Permanently departed (internal users only) | Same as disabled — still a soft state, not a delete |

No internal user is ever hard-deleted (`docs/V2-ORG-ADMIN-IA.md` §5). External-user permanent
removal remains deferred until real invitations/auth exist to make "remove" meaningful.

## 4. Access Level

`standard_user | org_admin`. Column default is **`org_admin`**, not `standard_user` — deliberately,
because at migration time there was exactly one `User` row per organization (the demo user, who
already had unrestricted control of their own data). Defaulting to `standard_user` would have
migrated that single-user org into a **zero-admin state**, which is exactly what the last-admin
safeguard (§9 below) exists to prevent. This default is a backfill safety net, not the intended
value for newly invited users — `POST`-style user creation should set it explicitly.

This is now the **first real, server-enforced authorization** in the V2 codebase: every
`/api/admin/*` mutation route checks `actor.accessLevel === "org_admin"` and returns 403 otherwise
(`src/app/api/admin/users/[userId]/route.ts`, `src/app/api/admin/teams/**`). See §15 for exactly
what this does and doesn't guarantee.

## 5. Working Role

`product_management | project_manager | developer | null`. Nullable, **no default** — Working
Role has only ever lived in the Step 4 onboarding cookie, and there was no truthful value to
backfill an existing `User` row with. Assigning a fabricated default was explicitly rejected. The
User Detail screen lets an admin set it, and leaves "Not set" as a first-class option rather than
forcing a choice.

## 6. Member Type

`internal | external`, default `internal`. Drives the External badge in the Users list and (once
Step 8C exists) the View-only ceiling from `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §7. Not yet
enforced anywhere beyond display — there's no resource grant to cap yet.

## 7. Team Model

Flat — no nesting, no team roles, matching `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §3. No status/
archive field: nothing in the approved admin workflow archives a team, only deletes one, so the
field wasn't added speculatively.

## 8. Team Membership

`TeamMember` joins `User` and `Team`, unique on `(teamId, userId)`. Duplicate membership is
blocked **at the database level**, not just in application code — `POST
/api/admin/teams/[teamId]/members` catches the resulting Prisma `P2002` violation and returns a
friendly `409 "This person is already on the team."` instead of a raw error. Verified live: adding
the same user twice returns 409 on the second call.

## 9. Users UI

`ADMIN → Users` (`/admin/users`) — dense table (`ui/Table`, first real adopter), columns: User,
Email, Working Role, Access Level, Member Type, Teams, Status, Actions. Client-side filters
(status, working role, member type, access level, team) and name/email search — all simple
in-memory filtering over an already-fetched list, per `docs/V2-ORG-ADMIN-IA.md`'s "keep it
simple" guidance for this org size. Disabled/archived rows render visually de-emphasized
(dimmed), not hidden.

Gated entirely on `accessLevel === "org_admin"` server-side (redirects to `/home` otherwise) —
unlike Teams, this is not admin-aware/viewable, per the approved Screen Inventory.

## 10. User Detail

`/admin/users/[userId]` — Profile (name/email/status + Disable/Archive/Re-enable actions),
Organization Authority (Access Level select), Working Role (select, "Not set" available), Member
Type (select), Teams (current memberships + add-to-team picker), and an explicit **Resource
Access — configured in Step 8C** boundary instead of fabricated grant data. Every field writes
through `PATCH /api/admin/users/[userId]`, which is where the real authorization and last-admin
checks live — the form only ever reflects what the server actually did.

## 11. Teams UI

`ORGANIZATION → Teams & Stakeholders` (`/teams`) — **admin-aware, not a second Teams system**: any
org member can view the list (name, description, member count, external-member count); only an
Organization Admin sees the "+ Create team" button. No fake initiative-access counts are shown
(that data doesn't exist until Step 8C).

## 12. Team Detail

`/teams/[teamId]` — Members (name, email, External/Disabled badges where relevant), Add/Remove
member (admin-only controls, same admin-aware pattern as the list), and an explicit **Initiative
Access will be managed in Step 8C** boundary. Reached from both the Teams list and each member's
own User Detail page — same underlying `TeamMember` rows either way, never a separate copy.

## 13. Disable / Re-enable

Verified live: disabling a user sets `status = disabled`, leaves `TeamMember` rows untouched, and
re-enabling sets `status = active` with zero rebuild work — exactly the "preserve, don't delete"
behavior `docs/V2-ORG-ADMIN-IA.md` §5 recommended. Disabled/archived users remain visible in team
rosters, de-emphasized rather than hidden, so an admin isn't confused about why a listed member
can't act.

## 14. Working Role Cookie Transition

`src/lib/onboarding/resolveWorkingRole.ts` is now the single place every reader goes through:
prefer the persisted `User.workingRole` when set, fall back to the Step 4 onboarding cookie
otherwise. Adopted by the Standard Dashboard (`/home`) and the new-initiative bootstrap page — the
old direct `onboarding.workingRole ?? null` reads were replaced, not duplicated.

The onboarding role-selection flow (`WorkingRoleSelector.tsx`) now does **both**: writes the cookie
(unchanged, still the source of truth for that navigation) and fires `PATCH
/api/account/working-role` to persist onto the real `User` row. The cookie mechanism is not
removed yet — retiring it is a future cleanup once enough real usage confirms every path reads the
persisted value correctly; nothing in this phase depended on removing it early.

## 15. Security Limitation

`/api/admin/*` routes and the `/admin/users*` pages check `accessLevel === "org_admin"` for real —
this is genuine server-side enforcement of one real, persisted field, not a fake check. What it
does **not** provide: there is still only one session-bound user in the entire prototype
(`getCurrentUser()` always returns the same demo user), so this check has never been exercised
against an actual second, lower-privileged session — there's no real login, no real multi-user
identity, and no Supabase Auth wiring yet (`docs/V2-ARCHITECTURE.md` §10, unchanged). The ADMIN
nav's visibility gate (§4) is presentation only, same as it always was, layered on top of that real
but narrow server check. Full RBAC and real authentication remain deferred to a future phase.

## Git Strategy

Before the migration was applied, all of Steps 4–8B's accumulated work was committed locally to a
new `v2-redesign` branch (one checkpoint commit, `git checkout -b v2-redesign` from `master`) —
recoverable, not pushed anywhere. `guided-planning-platform`'s (Prototype 1's) repository, remote,
and `master` branch were not touched. The recommended eventual state, not yet acted on beyond the
local branch: add the same GitHub remote (`https://github.com/Clazzicode/productplaner.git`) to
this folder and push `v2-redesign` only when explicitly decided — `master` stays Prototype 1's
recoverable, currently-deployed history.

## 16. Step 8C Dependencies

- `InitiativeAccess` (Owner/Edit/View, direct + team grants) — the "Resource Access" and
  "Initiative Access" boundaries left in User Detail and Team Detail exist specifically to be
  filled in here.
- The shared server-side resolution function `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §21 calls for
  should be built once, before any of the three access UIs (User/Team/Initiative entry points),
  matching this phase's `isLastActiveOrgAdmin`-style helper pattern
  (`src/lib/admin/safeguards.ts`) — small, tested, server-only functions the routes call into.
- Member Type's View-only ceiling (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §7) becomes real only once
  there's a grant level to cap.
- `AuditLog` — event capture for team/user/access changes, per `docs/V2-ORG-ADMIN-IA.md` §19,
  still not built.
