# Prototype 2 Onboarding (Step 4)

Status: **Temporary implementation — zero database writes.** This adds a functional onboarding UI
in front of the existing guided questionnaire, using only the "temporary authenticated user" (the
hardcoded demo session — see `src/lib/auth/session.ts`) and no schema changes. All four captured
values (organization name, company size, industry, working role) live only in a browser cookie;
none reach Prisma/Postgres/Supabase. This was corrected after an initial version briefly persisted
organization name to the shared database — see Temporary Persistence below. Nothing here is the
final, persisted onboarding experience — see "What Step 5+ should build next" below.

## Flow

```
Temporary authenticated user (demo session)
  ↓
/onboarding        — Organization Setup (name, optional company size, optional industry)
  ↓
/onboarding/role   — Working Role Selection (Product Management / Project Manager / Developer)
  ↓
/welcome           — existing guided qualifying questionnaire (unchanged)
```

Entry point: `src/app/page.tsx` (`/`) now redirects to `/onboarding` instead of straight to
`/welcome`, unless the user already has a `QualifyingProfile` (existing users still go straight to
`/home`, unchanged) or has already completed onboarding this session (see Temporary Persistence
below) — in which case it skips directly to `/welcome`.

`/welcome` itself was not modified and is not gated — it remains directly reachable at its own URL,
same as before this phase.

## Temporary Persistence

**Corrected as of the Step 4 follow-up:** all four onboarding values — organization name, company
size, industry, and working role — are held **only** in a single cookie, `v2_onboarding`
(JSON-encoded, `src/lib/onboarding/tempStateClient.ts` for client reads/writes,
`src/lib/onboarding/tempStateServer.ts` for the server-side read used by the root redirect). This
is what makes back-navigation and refresh work within a session without touching Prisma.

**None of these four values are written to the database in this phase.** An earlier version of
this implementation persisted organization name to the existing `Organization.name` field via an
`/api/onboarding/organization` route. That route has been **removed**: Prototype 1 and Prototype 2
still share the same Supabase/Postgres database (`docs/V2-ARCHITECTURE.md` §11), and writing
onboarding data into that shared database — even to an existing field — was an unnecessary risk
while isolation hasn't happened yet. The demo organization's `name` row is untouched by onboarding
and stays whatever it already was.

Why a cookie and not `localStorage`: the root page (`/`, a Server Component) needs to decide
server-side whether to send a visitor to `/onboarding` or straight to `/welcome`, and
`localStorage` isn't readable on the server. A cookie is still not the database — nothing here
required a migration.

## Working Role Options

Exactly one of, captured on `/onboarding/role`:

- `product_management` — Product Management
- `project_manager` — Project Manager
- `developer` — Developer

Selection is single-choice (`aria-pressed` on the selected card), Continue is disabled until a
role is chosen. This matches `docs/V2-ARCHITECTURE.md` §4: Working Role is presentation-only in
this phase — it is not wired to any permission or access-level logic, because none has been built
yet.

**Future mapping:** once Step 3B/5+ adds real persistence, `workingRole` from the cookie maps
directly to the planned `User.workingRole` field described in `docs/V2-ARCHITECTURE.md` §10. No
value-mapping/translation will be needed — the three cookie values above are already the values
that field is expected to hold.

## Route Protection

None added in this phase, intentionally. `/onboarding` and `/onboarding/role` are reachable by
anyone who reaches the app (same as every other route today — there is no auth yet at all). Real
route protection arrives with Step 3B authentication.

## What's Deferred Until Database Isolation / Authentication

- **Organization name, company size, industry, and working role are all temporary** — none are
  written to the database. All four exist only in the `v2_onboarding` browser cookie for this
  session/browser. Real fields (`Organization.name` reuse, plus new `Organization.companySize` /
  `Organization.industry` / `User.workingRole`) need a migration against the isolated V2 database
  (blocked per `docs/V2-ARCHITECTURE.md` §11) and real per-user auth to know *whose* organization
  to write.
- The onboarding-complete flag lives only in the cookie. Clearing cookies / using a different
  browser will re-trigger onboarding even for a "returning" demo session, since there's no durable
  signal to check yet.
- No real per-user identity exists yet, so "one organization per new account" isn't meaningfully
  testable — today there is exactly one shared demo user/organization, and onboarding no longer
  touches that row at all.
- No validation/uniqueness beyond a minimum-length organization name; no handling for multiple
  users onboarding concurrently (not a real scenario yet — single demo user).

## What Step 5+ Should Build Next

- Once Step 3B lands real Supabase Auth and an isolated V2 database: add `User.workingRole` and
  (if still desired) `Organization.companySize` / `Organization.industry` as real columns, reintroduce
  an API route for organization setup, and replace the cookie reads/writes in
  `OrganizationSetupForm.tsx` / `WorkingRoleSelector.tsx` with real API calls that persist all four
  values for the authenticated user's own organization.
- Replace the "one shared demo organization" assumption with real per-account organization
  creation.
- Add server-side route protection to `/onboarding*` once auth exists, instead of the current
  unguarded access.
- Decide the open question flagged in `docs/V2-ARCHITECTURE.md` §4: whether Organization Admins
  also set a personal working role.
