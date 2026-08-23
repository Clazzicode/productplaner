# V2 Standard Dashboard (Step 7B)

Status: **Implemented, read-only.** Builds on `docs/V2-ARCHITECTURE.md` (Step 2),
`docs/V2-APPLICATION-SHELL-BLUEPRINT.md`/`docs/V2-DESIGN-SYSTEM.md` (Step 6A/6B),
`docs/V2-SHELL-COHESION-QA.md` (Step 6C), and `docs/V2-ACCESS-TEAMS-VISIBILITY.md` (Step 7A). No
Prisma changes, no migrations, no writes — every widget reads existing tables through existing
generation-engine functions. `/initiatives/[initiativeId]/dashboard` (the initiative-scoped
dashboard) is unchanged.

## 1. Purpose

The Standard User Dashboard is the global, everyday home screen for a normal organization member.
It answers, at a glance: What am I working on? What needs my attention? Is the work healthy? What's
coming next? What changed? Which initiative should I enter? It is not the Organization Admin
Dashboard, the Super Admin Console, an initiative-specific dashboard, or a portfolio executive
report — none of those exist yet and none were built here.

## 2. Global vs Initiative Dashboard

| | Global Dashboard (`/home`) | Initiative Dashboard (`/initiatives/[id]/dashboard`) |
|---|---|---|
| Scope | User's operational home — across every initiative they own | One initiative, in full detail |
| Built | Step 7B (this phase) | Pre-existing, untouched |
| Reached without selecting an initiative first | Yes | No — always initiative-scoped |
| Nav item | **Dashboard** (now points here — see §14 below) | Reached from the initiative summary widget, or an initiative's own breadcrumb |

The Sidebar's **Dashboard** item now points at `/home` unconditionally, no longer scoped to (or
disabled by) the current initiative — this supersedes the Step 6C "Dashboard Interim Behavior"
note in `docs/V2-SHELL-COHESION-QA.md`, which explicitly deferred that change to "Step 7 work."
The initiative list that used to live at `/home` moved, unchanged, to `/initiatives`; the
**Initiatives** nav item now points there.

## 3. Visual Reference Translation

The supplied CRM dashboard screenshot informed composition, not content: personalized greeting,
modular blocks of varying visual weight (not four identical stat cards), a distinctive right-side
timeline, and a mix of status/progress/list/timeline information types. The Step 6 design system
remained the source of truth for shell, sidebar, navigation, chrome, typography, and semantic
colors — no new colors were introduced. The one deliberate addition: the four-tier
`health-good`/`health-attention`/`health-warning`/`health-critical` badge tokens (provisioned in
Step 6B, unconsumed until now — `docs/V2-DESIGN-SYSTEM.md` §10) got their first real consumer via
a new `healthTokenVariant()` helper in `ui/Badge.tsx`. The real `HealthStatus` domain type still
has only three values, so `health-warning` remains reserved/unconsumed, exactly as Step 6B
documented — not force-mapped to a distinction the data doesn't make.

## 4. Dashboard Zones

| Zone | Contents | Placement |
|---|---|---|
| 1 — Operational Overview | Plan Health, Current Sprint, Roadmap Snapshot, My Work / Current Focus | Main column |
| 2 — Upcoming Timeline | Sprint/release/launch checkpoints across every generated initiative | Right rail (desktop); inline in the stack (narrow) |
| 3 — Current Work / Initiatives | Your Initiatives (primary highlighted + compact rows for the rest) | Main column |
| 4 — Attention / Activity | Attention, Upcoming Actions, Recent Activity | Main column |

All nine widgets always render (nothing is hidden by role) — Working Role changes their **order**
within the main column only (§7). No dedicated Capacity/Cost widget was built (§8, §12).

## 5. Widget Registry

`src/lib/dashboard/widgetRegistry.ts` — pure data, no React, unit-tested
(`src/lib/dashboard/__tests__/widgetRegistry.test.ts`):

- `DASHBOARD_WIDGETS`: id, title, `defaultVisible` (always `true` today — no persisted
  Dashboard Configuration exists yet, see §9).
- `ROLE_WIDGET_ORDER`: one ordered id list per Working Role.
- `resolveDashboardOrder(role)` / `resolveMainColumnOrder(role)`: the full stacked order, and the
  same order with `upcoming_timeline` excluded (it has its own fixed right-rail slot on desktop —
  §11).

This is deliberately not a drag-and-drop builder or a database table — it's the smallest thing
that lets `src/app/home/page.tsx` render widgets in role order today, and that a future Step 8
Dashboard Configuration model can override without any dashboard code changing (§15).

## 6. Widget Data Classification

| Widget | Classification | Notes |
|---|---|---|
| Plan Health | Derived | `scheduleHealth()` / lock-count math over real Sprint/ArtifactLayer/LayerLock rows — same function the initiative dashboard uses, not a second calculation |
| Current Sprint | Real + Derived | Sprint/Release rows are real; capacity-utilization % is derived. Reuses the existing `SprintReleaseStatus` component as-is |
| Roadmap Snapshot | Derived | Phase/milestone/progress computed from real lock/sprint/release data; a new compact component (existing `RoadmapTimeline` is the detailed per-capability view, kept as-is on the initiative dashboard) |
| My Work / Current Focus | Derived (temporary substitute) | No per-user assignment data exists (`ArtifactLayer` has no `assigneeId`) — shows the current sprint's real, unassigned story titles instead, explicitly labeled as team-wide, not per-person. See §14 |
| Your Initiatives | Real | Direct `Initiative`/`Prototype` rows, same source `/initiatives` already used |
| Upcoming Timeline | Derived | Real `Sprint.startDate`, `Release.targetDate`, `Initiative.targetLaunchDate`, merged and sorted across every generated initiative |
| Attention | Derived | Reuses the existing `DecisionsRequiredPanel` component and the same signal set (active layer, over-allocated sprints, oversized stories, intake validation warnings) the initiative dashboard already surfaces — minus the cost/budget item, see §8 |
| Upcoming Actions | Derived | Same "generated from current plan state" pattern as the initiative dashboard's existing `UpcomingActions` component (reused as-is) |
| Recent Activity | Derived | Existing timestamps on real rows (intake, prototype, locks, baseline, sync) — no `ActivityLog` table, same pattern the initiative dashboard already uses via its own (unchanged) `RecentActivity` component |
| Greeting | Real | `User.name` from the database |
| Operational summary | Derived | Deterministic template over real counts (initiative count, attention-item count, next checkpoint) — **not** LLM-generated |

No widget is a **Deferred** empty placeholder — every one is grounded in real data, including its
empty state (rendered when there's no generated initiative yet, not fabricated).

## 7. Working Role Defaults

`ROLE_WIDGET_ORDER` (widgetRegistry.ts) orders all nine widgets per role:

- **Product Management**: Plan Health, Roadmap Snapshot, Your Initiatives, Upcoming Timeline,
  Attention, Upcoming Actions, Current Sprint, Current Focus, Recent Activity.
- **Project Manager**: Upcoming Timeline, Current Sprint, Roadmap Snapshot, Attention, Upcoming
  Actions, Plan Health, Your Initiatives, Current Focus, Recent Activity.
- **Developer**: Current Sprint, Current Focus, Attention, Upcoming Actions, Recent Activity, Plan
  Health, Roadmap Snapshot, Upcoming Timeline, Your Initiatives.

One dashboard architecture, one component tree, one data loader — `src/app/home/page.tsx` renders
the same nine widgets for every role, reordered by `resolveDashboardOrder()`. There is no
per-role dashboard implementation. When Working Role is unknown (onboarding incomplete, or an Org
Admin with no personal role — an open question per `docs/V2-ARCHITECTURE.md` §4, not decided here),
a neutral default order is used instead of guessing.

## 8. Authorization Boundary

Per `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §1/§12: `Authorization → Dashboard Configuration →
Working Role`. Authorization is not implemented yet (no `Team`/`InitiativeAccess` model, no
`accessLevel`/`memberType` fields), so nothing here fakes it:

- `loadGlobalDashboardData(userId, authorizedInitiativeIds)`
  (`src/lib/dashboard/globalDashboardData.ts`) takes an explicit `authorizedInitiativeIds: string[]
  | null` parameter. Today every call site passes `null`, meaning "not yet enforced — fall back to
  ownership" (`userId` filtering only). Every query inside is already shaped to accept a narrower
  id list; wiring real Resource Access later means changing what gets passed in, not the query
  shape.
- No dedicated Capacity/Cost widget was built, and no dollar figures (budget, cost, hourly rate)
  appear anywhere on this dashboard — deliberately, since those are exactly the fields
  `docs/V2-ACCESS-TEAMS-VISIBILITY.md` §9 flags as sensitive, and per-widget sensitivity gating
  doesn't exist yet. This isn't a missing feature so much as a boundary respected early: the
  Attention widget reuses the initiative dashboard's decision signals **minus** its budget-overrun
  item.
- Working Role never gates data — it only reorders widgets that were already going to render (§7).
- Dashboard Configuration doesn't exist as a persisted concept yet (§9) — nothing here reads it as
  an authorization signal, because there's nothing to read.

## 9. Dashboard Configuration Boundary

No `DashboardConfiguration` model or admin UI was built — out of scope for this phase and
explicitly listed under "No Admin Controls" in the brief. `widgetRegistry.ts`'s
`defaultVisible: true` on every widget is the seam: a future Step 8 model can override which
widgets render per role/org without any dashboard component changing, but nothing persists a
choice today. Dashboard Configuration must never be read as authorization (§8) — this dashboard
doesn't currently have a configuration layer to accidentally conflate with authorization in the
first place, which is the safest state to leave it in until Step 8.

## 10. Multiple Initiative Handling

`loadGlobalDashboardData` picks a **primary initiative**: the most recently updated `generated`
initiative, falling back to the most recently updated initiative of any status if none is
generated (same selection rule `LeftNav.tsx` already uses for its initiative-scoped links — kept
consistent rather than inventing a second rule). Zone 1 and Zone 4 widgets detail the primary
initiative only. The **Your Initiatives** widget (Zone 3) highlights the primary initiative and
lists up to five others compactly, each linking into its own dashboard or intake flow, plus a
"View all →" link to `/initiatives`. The full CRM-style dense Initiatives table was not built here
— it remains a separate, future page (`docs/V2-APPLICATION-SHELL-BLUEPRINT.md` §8/§9).

## 11. Timeline

`UpcomingTimeline` aggregates real, future-dated checkpoints across **every** generated
initiative (not just the primary one) — upcoming `Sprint.startDate`, `Release.targetDate`, and
`Initiative.targetLaunchDate`, merged and sorted, capped at 8 entries. Each entry tags its
initiative name only when the user has more than one generated initiative (avoids repeating a
name that would otherwise be redundant). This is a product-delivery timeline, not a calendar
integration — no Google Calendar/Outlook, no scheduling functionality. Desktop (`xl:` and above):
right-side rail, its own visually distinct card (accent rail, connector line, kind badges) while
using only existing Step 6 tokens. Below `xl:`: renders inline in the single-column stack, at the
rank `ROLE_WIDGET_ORDER` gives it for that role.

## 12. External/Client Readiness

No client/external dashboard was built (out of scope). Every sensitive category called out in
`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §9 — financials, costs, capacity, internal risks, internal
decisions — is either absent from this dashboard entirely (cost/budget/capacity, §8) or, where a
future authorization layer needs to filter something (e.g. the Attention widget's contents), that
filtering happens on data the widget already receives as props — nothing here is structured so a
sensitive widget is structurally mandatory or hard-coded to always render for every viewer.

## 13. Responsive Behavior

Two DOM branches, gated by the `xl:` breakpoint (1280px) — the same "render both, toggle by
breakpoint" pattern `AppShell.tsx` already uses for `LeftNav` vs. `MobileNavDrawer`:

- **`xl:` and above** (large desktop, standard laptop): two-column grid — main column
  (`resolveMainColumnOrder`) plus a fixed right-rail Upcoming Timeline.
- **Below `xl:`** (narrow laptop/tablet/mobile): single column, full role order
  (`resolveDashboardOrder`, timeline included at its ranked position) — matching the brief's
  suggested narrow ordering (greeting → primary operational widgets → current work →
  roadmap/sprint → timeline → secondary activity), since each role's order already places
  Attention/Upcoming Actions/Recent Activity after the primary operational widgets.

Verified at three widths in the dev browser: large desktop (1440px), standard laptop (1280px),
and narrow/tablet (768px) — no horizontal overflow at any width; see §15 of the completion report
for the actual pass/fail.

## 14. Known Data Limitations

- **No per-user story assignment.** `ArtifactLayer` has no `assigneeId`. "My Work / Current Focus"
  shows the current sprint's planned stories platform-wide (or the most recently planned stories
  when there's no current sprint, e.g. continuous-flow methodology) instead of inventing a fake
  assignment backend. The widget is explicitly labeled as showing team-wide work, not personal
  assignment. Swap the data source once real assignment exists — the component's props shape
  doesn't need to change.
- **No dedicated Risks & Blockers module.** The Attention widget reuses the same legitimate
  signals the initiative dashboard already computes (active layer to review, over-allocated
  sprints, oversized stories, intake validation warnings) rather than a purpose-built risk model
  that doesn't exist yet.
- **No ActivityLog table.** Recent Activity is derived from existing timestamps on real rows
  (intake, prototype, locks, baseline approval, integration sync), exactly as the initiative
  dashboard's existing `RecentActivity` component already does — not a new pattern.
- **Working Role is cookie-only.** It lives in the Step 4 onboarding cookie
  (`src/lib/onboarding/tempStateServer.ts`), not a persisted `User.workingRole` field
  (`docs/V2-ARCHITECTURE.md` §10 still lists that as a future addition). If the cookie is absent
  or cleared, the dashboard falls back to a neutral default order rather than erroring.
- **No Capacity/Cost widget.** Deliberately excluded — see §8.

## 15. Step 8 Dependencies

What a future phase needs before it can safely extend this dashboard:

- `User.accessLevel`, `User.memberType`, `Team`/`TeamMember`, `InitiativeAccess` — once real, pass
  the resolved list into `loadGlobalDashboardData`'s `authorizedInitiativeIds` parameter instead of
  `null` (`docs/V2-ACCESS-TEAMS-VISIBILITY.md` §21 already sequences this).
  `authorizedInitiativeIds` is the only call site that needs to change.
  Capacity/Cost widget (deferred here) should only be added once `sensitiveDataVisible` resolution
  exists to gate it per viewer.
- A persisted `DashboardConfiguration` model would let an Org Admin override
  `widgetRegistry.ts`'s per-role defaults per organization — the registry's `defaultVisible` flag
  and `resolveDashboardOrder()` signature are the intended extension points.
- `User.workingRole` as a real persisted field (rather than a cookie) once Step 3B/5+ auth and
  schema work lands, per `docs/V2-ARCHITECTURE.md` §12.
- Real per-user story assignment, to replace the Current Focus widget's temporary substitute (§14).
