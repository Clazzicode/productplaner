# V2 Organization Admin Dashboard (Step 8D)

Status: **Implemented.** Builds on `docs/V2-ARCHITECTURE.md` (Step 2),
`docs/V2-STANDARD-DASHBOARD.md` (Step 7B, the sibling dashboard this one is
deliberately *not* a copy of), `docs/V2-USERS-TEAMS.md` (Step 8B),
`docs/V2-RESOURCE-ACCESS.md` (Step 8C), and `docs/V2-ORG-ADMIN-IA.md` §14's
scope note for this phase. No Prisma changes, no migrations, no writes —
every module reads existing tables through existing generation-engine
functions or a small amount of new, pure aggregation. Dashboard Configuration
(Step 8E) and Super Admin remain unbuilt.

## 1. Purpose

The Organization Admin Dashboard is the organization-wide control center for
an active Organization Admin. It answers, at a glance: How is the
organization performing? Which initiatives need attention? Which users or
teams need action? Are there access or onboarding issues? What releases are
approaching? Are integrations healthy? What should the admin review today?
It is not the Standard User Dashboard, not Super Admin, and not Dashboard
Configuration — none of those are built or extended here.

## 2. Difference From Standard Dashboard

| | Standard Dashboard (`/home`) | Admin Dashboard (`/admin`) |
|---|---|---|
| Scope | One user's own assigned work | Every user/team/initiative in the organization |
| Personalization | Working-Role-ordered widgets, personal greeting | None — one fixed composition for every admin |
| Primary unit | A "primary initiative," detailed | Every initiative, summarized in one dense table |
| Emphasis | "What am I working on?" | "What needs management attention?" |
| Density | Card-per-widget, generous spacing | Dense table + compact stat blocks |
| Layout | `DashboardLayout` (`max-w-7xl`) | `WideLayout` (`max-w-[1600px]`) — first real adopter of the layout mode `docs/V2-DESIGN-SYSTEM.md` §8 provisioned but never applied |

Both are built from the same primitives (`Card`/`CardTitle`, `Badge`,
`Table` family, `EmptyState`, `PageHeader`) and the same dark-nav/light-panel
shell — confirmed side-by-side in browser QA (§16) to read as the same
product, not the same dashboard with different labels.

## 3. Authorization

`src/app/admin/page.tsx` (route `/admin`) uses the identical gate shape
already proven live on `/admin/users` and `/admin/access`
(`docs/V2-RESOURCE-ACCESS.md` §12/§14):

```ts
const profile = await getActiveProfile();
if (!profile) redirect("/welcome");
const user = await getCurrentUser();
if (user.accessLevel !== "org_admin" || user.status !== "active") redirect("/home");
```

The `status !== "active"` check is new relative to the two existing admin
pages (which check `accessLevel` only) — added here because this phase's
brief explicitly requires *active* Organization Admin, narrowly, without
retrofitting the existing pages. A Standard User (or a disabled admin) is
redirected to `/home` — the same behavior already used for `/admin/users` and
`/admin/access`; no new access-denied pattern was invented for this phase.

**Session limitation** (same honest note as `docs/V2-RESOURCE-ACCESS.md`
§20): the gate is real, server-side code, reusing an already-proven check —
but this prototype still has exactly one session-bound demo user
(`getCurrentUser()` always returns the same row), so the redirect couldn't be
exercised end-to-end against a genuine second, lower-privileged session. No
fake user was created to manufacture that test.

## 4. Composition

```
AdminDashboardHeader (org name, operational summary, quick actions)
OrgSummaryStrip (Users | Teams | Initiatives | Attention | Releases)
xl: two-column grid
  Left:  Portfolio / Initiative Health, Delivery Intelligence, Teams / Membership
  Right: Admin Attention, Users, Access, Upcoming Timeline, Integration Health
Below xl: single column, left column's widgets then right column's
```

Deliberately not the Standard Dashboard's geometry: no personal greeting, no
per-role widget order, no "My Work / Current Focus" — portfolio, attention,
and access take priority. Driven by `src/lib/dashboard/adminWidgetRegistry.ts`
(`ADMIN_DASHBOARD_WIDGETS`, `LEFT_COLUMN_ORDER`, `RIGHT_COLUMN_ORDER`,
`ADMIN_DASHBOARD_ORDER`) exactly the way `src/app/home/page.tsx` is driven by
`widgetRegistry.ts` — a small, separate `AdminDashboardRegistry`-equivalent
rather than forcing both dashboards through one config, since Admin has no
Working-Role personalization axis to key a per-role order off. Both desktop
and narrow layouts render from this same registry (no hardcoded JSX order to
drift out of sync).

## 5. Organization Summary

`OrgSummaryStrip` — five compact stat tiles: Users, Teams, Initiatives,
Attention, Releases. All **Real** or **Derived** (§12): active/disabled user
counts, team count, initiative count, admin attention item count, and count
of future `Release` rows across the organization.

## 6. Users Intelligence

`UsersIntelligencePanel` — active, disabled, archived, external, no-Working-
Role, no-team, and Organization Admin counts, all grouped from real `User`
rows scoped to the organization. No "recent status changes" — no
`ActivityLog` table exists yet (`docs/V2-ARCHITECTURE.md` §10), so nothing
here fakes one. Links to `ADMIN → Users`.

## 7. Teams Intelligence

`TeamsIntelligencePanel` — team count, zero-member teams, teams with no
initiative access, teams with an external member — all from real `Team`/
`TeamMember`/`InitiativeAccess` rows. Links to `ORGANIZATION → Teams &
Stakeholders`. No team editing on the dashboard itself.

## 8. Initiative / Portfolio Health

`PortfolioHealthTable` — the strongest module, per the brief. Dense `Table`:
Initiative · Health · Status · Owner · Team Access · Delivery % · Next
Milestone · Access (grant count). Every initiative the Org Admin can access —
which, per Step 8C's implicit-owner rule, is every initiative in their
organization. Health/Delivery % reuse the exact `scheduleHealth`/
`computeCapacityForecast` functions the initiative dashboard and Standard
Dashboard already use — not a second scoring system. A non-generated
initiative shows `—` for the computed columns rather than a fabricated value.

## 9. Access Intelligence

`AccessIntelligencePanel` — users with direct grants, users with no resolved
resource access (active standard users with neither a direct grant nor a
team membership that carries one), external users with/without active
access, initiatives with external access, and disabled users whose grants
remain stored. All read from Step 8C's `InitiativeAccess` rows — the same
data `/admin/access` manages. Presented as counts, not security alerts: a
non-zero count here is a normal state for a real organization, not an error.

## 10. Delivery Intelligence

`DeliveryIntelligencePanel` — at-risk initiative count, over-allocated
sprint count (both derived from `computeCapacityForecast`, aggregated across
every generated initiative), and initiatives approaching their target launch
date. No new delivery-scoring engine.

## 11. Admin Attention

`AdminAttentionPanel` — assembled in `loadAdminDashboardData()` from values
already computed for the other modules, never a second calculation. Each
item carries a severity (`risk` / `warning` / `info`) and links to the
relevant management screen:

- Only one active Organization Admin (`info`)
- An initiative's schedule health is at risk (`risk`)
- An initiative's stored Owner grant belongs to a disabled user (`warning`)
- Teams with no initiative access / teams with no members (`info`)
- Active users with no resolved resource access (`warning`)
- Active standard users with no team, or with no Working Role set (`info`,
  Organization Admins excluded — an admin's own no-team/no-role state isn't
  actionable, since implicit access and personal Working Role are both
  optional-by-design for that role per `docs/V2-ARCHITECTURE.md` §4)
- External users without active access (`info`)
- Disabled users still on a team roster, or still holding stored grants
  (`info`) — explicitly framed as allowed-by-design (`docs/V2-ORG-ADMIN-IA.md`
  §20), not an error

Normal valid states (a single Owner grant, one team membership) are never
surfaced — only the conditions above are.

## 12. Timeline

`AdminTimeline` — sprint starts, release targets, and initiative launch
targets across **every** initiative in the organization (not just one
"primary" initiative, unlike the Standard Dashboard), always
initiative-labeled. Same real `Sprint.startDate`/`Release.targetDate`/
`Initiative.targetLaunchDate` fields as the Standard Dashboard's timeline —
not a calendar integration.

## 13. Integration Health

`IntegrationHealthPanel` — reads real `IntegrationConnection`/
`IntegrationProvider` rows (the same tables `/integrations` itself reads).
Shows connected providers with real last-sync timestamps when a demo
connection genuinely exists; otherwise an honest "Nothing connected yet — 0
of N available integrations connected" empty state. Never fabricates a
healthy sync.

## 14. Quick Actions

Three navigation links only, in the header (`View Users`, `View Teams`,
`Manage Access`) — no forms on the dashboard itself. No "Add User" action:
`/api/admin/users` is PATCH-only today (no invite/create-user endpoint
exists), so linking one would point at a feature that doesn't work.
Dashboard = overview; management screens remain the place administration
actually happens.

## 15. Data Classification

| Module | Classification |
|---|---|
| Organization summary (users/teams/initiatives counts) | Real |
| Attention count, Releases count | Derived |
| Portfolio table: name/status/owner | Real |
| Portfolio table: health, delivery %, next milestone | Derived (same functions as the initiative dashboard) |
| Portfolio table: team access / grant count | Real (`InitiativeAccess` rows) |
| Users intelligence | Real (grouped `User` rows) |
| Teams intelligence | Real/Derived (`Team`/`TeamMember`/`InitiativeAccess` counts) |
| Access intelligence | Derived (computed from `InitiativeAccess` + team membership) |
| Delivery intelligence | Derived (`computeCapacityForecast`, `scheduleHealth`) |
| Admin Attention | Derived (assembled from the above, never fabricated) |
| Upcoming Timeline | Real (`Sprint`/`Release`/`Initiative` date fields) |
| Integration Health | Real when connected; honest empty state otherwise |
| Dashboard Configuration | **Prototype UI Boundary** — not built; nav already shows a disabled placeholder (§18) |
| Audit history on Admin Attention items | **Deferred** — no `AuditLog` table exists yet |

Nothing on this dashboard is a fabricated placeholder; every empty state
(zero teams, zero connections, zero attention items) is a real, honest
result of real data, not a stand-in for an unbuilt feature.

## 16. Responsive Behavior

Same "render both DOM branches, toggle by the `xl:` breakpoint (1280px)"
pattern `src/app/home/page.tsx` already uses:

- **`xl:` and above**: explicit two-column grid (`minmax(0,1.6fr)_minmax(0,1fr)`).
- **Below `xl:`**: single column, left column's widgets then right column's,
  both driven by `ADMIN_DASHBOARD_ORDER`.

Verified in-browser via Playwright screenshots at 1440px, 1280px, and 768px:
no page-level horizontal overflow at any width; the dense `Table` inside
Portfolio Health scrolls horizontally within its own container at narrower
widths where its eight columns don't fit — acceptable per the brief, and the
same `overflow-x-auto` behavior `src/components/ui/Table.tsx` already
provides everywhere else. `/admin` and `/home` were captured side-by-side at
1440px: same shell, same tokens, clearly different composition (dense table
+ two-column control-center layout vs. card-stack + personal greeting).
Browser console showed zero errors/warnings on either page.

## 17. Step 8E Boundary

Not built here, per the brief's explicit stop condition:

- No `DashboardConfiguration` model, no widget visibility/ordering admin UI.
  `ADMIN_DASHBOARD_WIDGETS`' `defaultVisible: true` is the same kind of seam
  `docs/V2-STANDARD-DASHBOARD.md` §9 left for the Standard Dashboard — a
  future Step 8E could read persisted visibility per widget without any
  component here changing shape.
- The dashboard does not render a "Dashboard Configuration — not yet
  configured" placeholder card — the ADMIN nav already carries that disabled
  entry (`docs/V2-ORG-ADMIN-IA.md` §2), and a second placeholder on the
  dashboard itself would be redundant clutter rather than useful honesty.
- No Super Admin content (no cross-organization counts, no platform/billing
  data) appears anywhere on this dashboard.
