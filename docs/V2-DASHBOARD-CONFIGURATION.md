# V2 Dashboard Configuration (Step 8E)

Status: **Implemented.** Builds on `docs/V2-STANDARD-DASHBOARD.md` (Step 7B, the widget registry this
phase finally consumes), `docs/V2-ORG-ADMIN-IA.md` §12 (the approved MVP scope), and
`docs/V2-ARCHITECTURE.md` §11 (the shared-database migration rule this phase's `DashboardConfiguration`
table followed). This is the first schema change since Step 8C's `InitiativeAccess` table. Roadmap
redesign and Super Admin remain out of scope.

## 1. Purpose

An Organization Admin can now choose which Standard Dashboard widgets each Working Role sees —
Product Management, Project Manager, Developer — persisted per organization. Before this phase,
`widgetRegistry.ts`'s `defaultVisible: true` was a documented seam with nothing plugged into it; every
widget rendered for every role unconditionally. This phase plugs that seam in, and only that seam —
no ordering, no team-level configuration, no individual overrides, no drag-and-drop layouts, no custom
widgets, no Super Admin dashboard configuration.

## 2. Authorization Boundary

Restated exactly as the brief requires, because it is the one rule that must never regress:

```
Authorization → Dashboard Configuration → Working Role
```

- **Authorization** (`InitiativeAccess`, `accessLevel`, `memberType`) decides what data a user may
  reach. Unchanged by this phase.
- **Dashboard Configuration** (this phase) decides which of the *already-authorized* widgets render.
  It can only hide something that was already going to show; it can never reveal something
  authorization would otherwise withhold.
- **Working Role** decides which configuration/default set applies — it does not gate data either
  (`docs/V2-STANDARD-DASHBOARD.md` §7).

Enforced in code, not just by convention: `getEffectiveWidgetVisibility()`
(`src/lib/dashboard/dashboardConfiguration.ts`) takes only `organizationId` and `workingRole` — it has
no parameter through which `accessLevel`/`memberType`/`InitiativeAccess` could leak in, and
`src/app/home/page.tsx` calls `loadGlobalDashboardData()` (the authorization-aware data loader)
exactly as before, completely independent of the new visibility step.

## 3. Data Model

```prisma
model DashboardConfiguration {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  workingRole    String // product_management | project_manager | developer
  widgetId       String // must match a DASHBOARD_WIDGETS id
  visible        Boolean
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, workingRole, widgetId])
}
```

No `userId`, no `teamId`, no permission level — deliberately, per the brief: this table can never be
mistaken for, or grow into, an authorization table. `widgetId` is validated in application code against
`widgetRegistry.ts`, not by a database constraint — the same "String + app-level validation" convention
already used throughout this schema (e.g. `Initiative.status`).

**Sparse storage**: a row is only ever written when its `visible` value *differs* from the widget's
registry default. Saving a widget back to its default value deletes the row rather than storing a
redundant one (§8). An organization/role with no rows at all is a completely normal, expected state —
not a state anything needs to be "backfilled" into.

## 4. Widget Registry

`src/lib/dashboard/widgetRegistry.ts`'s `DashboardWidgetDefinition` gained one field:

```ts
export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  description: string; // business-purpose language, Step 8E
  defaultVisible: true;
}
```

All nine existing widgets got a one-line, business-purpose description (e.g. Plan Health: "Shows the
health and progress of the current plan.") — what the widget shows, never how it's implemented. This
is the single source of truth for the admin UI's copy; nothing hardcodes a widget's name or description
a second time anywhere else in the codebase. The registry remains exactly what
`docs/V2-STANDARD-DASHBOARD.md` §5 already established — pure data, no React, no I/O — this phase adds
a field to it, not a competing system.

## 5. Effective Configuration Resolution

Two files, mirroring `src/lib/access/resolution.ts` + `initiativeAccess.ts`'s pure/DB-facing split:

- **`src/lib/dashboard/dashboardConfigResolution.ts`** (pure, unit-tested, no DB):
  `resolveWidgetVisibility(overrides)` — for every widget in the registry, an override wins if
  present, else the registry default. `filterVisible(order, visibility)` filters an already-ordered
  widget id list down to the visible ones, preserving order.
- **`src/lib/dashboard/dashboardConfiguration.ts`** (DB-facing):
  - `getEffectiveWidgetVisibility(organizationId, workingRole)` — the Standard Dashboard's only entry
    point. `workingRole === null` skips the database lookup entirely and returns pure defaults.
  - `getRoleConfigurationView(organizationId, workingRole)` — the admin UI's full per-widget list
    (`id`, `title`, `description`, `visible`, `isOverridden`).
  - `saveRoleConfiguration(organizationId, workingRole, widgets)` / `resetRoleConfiguration(...)` — §8/§9.

Neither the Standard Dashboard nor the admin UI ever reads `db.dashboardConfiguration` directly or
knows the row shape — both call these functions, matching the brief's "keep data access behind a
helper/service boundary" instruction.

## 6. Working Role Relationship

Unchanged from Step 7B/8B: `resolveWorkingRole(user.workingRole, onboarding.workingRole)` — prefer the
persisted `User.workingRole`, fall back to the Step 4 onboarding cookie, `null` if neither exists. This
phase adds nothing new here; it just consumes the same resolved role Standard Dashboard ordering
already used, for a second purpose (looking up configuration) rather than introducing a second
resolution path.

## 7. Defaults

If **no** `DashboardConfiguration` row exists for an organization/Working Role — the state of every
organization on day one, and any role an admin has never touched — every widget falls back to
`widgetRegistry.ts`'s `defaultVisible: true`. Nothing requires rows to exist before this is safe; the
absence of rows *is* the safe, correct state, not a gap to fill.

## 8. Overrides (Save)

`POST /api/admin/dashboard-config/[workingRole]`, body `{ widgets: { id, visible }[] }`. Only the
given organization/Working Role's rows are touched — every other role and every other organization is
untouched (verified by `dashboardConfiguration.test.ts`'s isolation cases). Per §3, a widget whose
submitted value matches its registry default is cleared rather than stored — this is what makes
`isOverridden` in the admin UI honestly reflect "this widget's stored value differs from the code
default," not just "a save happened once."

## 9. Reset Behavior

`DELETE /api/admin/dashboard-config/[workingRole]` — `deleteMany({ where: { organizationId, workingRole } })`.
No second copy of default values exists anywhere to "reset to" — deleting the override rows is the
entire operation; the registry default is uncovered automatically the next time visibility is resolved.

## 10. Admin UI

`ADMIN → Dashboard Configuration` (`/admin/dashboard-configuration`), gated identically to `/admin` and
`/admin/users`/`/admin/access` (§11). Role switching is a server-rendered `?role=` link (three tabs),
matching how `/admin/access` → `/admin/access/[id]` already navigates rather than client-side tab
state. For the selected role, `DashboardConfigEditor` (`src/components/admin/DashboardConfigEditor.tsx`,
client component) renders one dense row per widget — title, description, a "Default" tag when no
override is stored, and an On/Off toggle — with an explicit **Save Changes** button (disabled until
something's actually changed) and a **Reset to Defaults** action behind a light confirmation modal (not
a destructive-red warning; this is fully reversible configuration). This is configuration UI, not a
dashboard preview — dense rows, not the Card treatment `/home`/`/admin` render widgets in.

State resync on a role switch uses React's documented "adjust state during render" pattern (comparing
the incoming `workingRole` prop to a tracked previous value and calling `setState` directly, not inside
a `useEffect`) — the effect-based version was tried first, tripped the same
`react-hooks/set-state-in-effect` lint rule already flagged elsewhere in this codebase's baseline, and
was replaced rather than left in as a new instance of a known anti-pattern.

## 11. Standard Dashboard Integration

`src/app/home/page.tsx` gained exactly one new step — no redesign:

```ts
const visibility = workingRole
  ? await getEffectiveWidgetVisibility(user.organizationId, workingRole)
  : resolveWidgetVisibility({});
const mainOrder = filterVisible(resolveMainColumnOrder(workingRole), visibility);
const fullOrder = filterVisible(resolveDashboardOrder(workingRole), visibility);
```

The desktop right-rail timeline slot only renders (and only claims its grid column) when
`visibility.upcoming_timeline` is true — a hidden timeline no longer leaves an empty 340px gap.
Ordering among still-visible widgets is completely unchanged; this phase filters an already-computed
order, it never recomputes one.

## 12. Authorization Boundary — Admin Only

Both `/admin/dashboard-configuration` and its two API routes use the exact gate shape already proven
live on `/admin`, `/admin/users`, and `/admin/access`:

```ts
if (user.accessLevel !== "org_admin" || user.status !== "active") /* redirect or 403 */
```

The `status !== "active"` check was added here (as it was for the Step 8D dashboard page) because this
phase's brief explicitly requires *active* Organization Admin — narrower than the two original
Step 8B admin pages, which check `accessLevel` only.

## 13. External / Sensitive Data Rule

Dashboard Configuration cannot override external-user restrictions, because it has nothing to override
them *with* — it only ever hides an already-rendering widget, never un-hides data authorization
withheld. Concretely, no Standard Dashboard widget carries cost, capacity, or other internal-sensitive
data today (`docs/V2-STANDARD-DASHBOARD.md` §8 deliberately excluded all of it) — so there is currently
nothing for a misconfigured toggle to leak. This is recorded here as the honest current state of that
rule, not assumed silently: if a future widget ever does carry sensitive data, that widget's data-layer
function must filter it per-viewer on its own, and Dashboard Configuration must remain irrelevant to
that decision.

## 14. Migration

`prisma/migrations/20260823191302_add_dashboard_configuration/` — reviewed before applying, per
`docs/V2-ARCHITECTURE.md` §11:

- `CREATE TABLE "DashboardConfiguration"`, one `CREATE UNIQUE INDEX`
  (`organizationId, workingRole, widgetId`), one `ADD FOREIGN KEY ... ON DELETE CASCADE` to
  `Organization`.
- Zero `DROP`, `RENAME`, or destructive `ALTER` — a brand-new, empty table; nothing about it can
  invalidate an existing row.
- Generated via `prisma migrate dev --create-only` (SQL inspected before anything touched the shared
  database), applied via `prisma migrate deploy` using the session-pooler connection as a temporary
  `DIRECT_URL` override for that one command only — the same approach Steps 8B/8C established, `.env`
  itself untouched. The user reviewed the exact SQL and explicitly approved applying it before it ran.
- Verified before/after: 3 Organizations, 1 User, 2 Initiatives, 2 `InitiativeAccess` rows unchanged;
  `DashboardConfiguration` starts at 0 rows.

## 15. Testing

- `src/lib/dashboard/__tests__/dashboardConfigResolution.test.ts` — pure, no DB: defaults with no
  overrides, an override hiding one widget, unknown override keys ignored, order preserved by
  `filterVisible`.
- `src/lib/dashboard/__tests__/dashboardConfiguration.test.ts` — DB mocked (`vi.mock("@/lib/db", ...)`,
  the same pattern `mutations.test.ts` uses): no-role skips the DB lookup entirely; no rows → all
  defaults; an override applies; an unknown `widgetId` row is ignored; role isolation (a Developer
  query's `where` clause never matches Product Management); organization isolation (scoped by
  `organizationId`); `getRoleConfigurationView`'s `isOverridden`/title/description correctness; save
  upserts a genuine override and clears a default-matching value in the same call; an unknown widget id
  is dropped before any write; reset deletes and the next read falls back to defaults.
- `src/lib/dashboard/__tests__/adminWidgetRegistry.test.ts` / `widgetRegistry.test.ts` — unaffected,
  still green (Step 8D's registry is a separate file).
- Full suite: 160 tests passing (18 files) after this phase, up from 137 (Step 8D) / 158 (mid-phase).

## 16. Known Limitations

- **Visibility only, no ordering** — matches the brief's explicit MVP scope. `ROLE_WIDGET_ORDER` still
  fully determines position for every widget that remains visible.
- **No team-level configuration, no individual overrides** — Organization → Working Role → Visibility
  is the entire hierarchy, per the brief.
- **No audit trail on configuration changes** — no `AuditLog` table exists yet
  (`docs/V2-ARCHITECTURE.md` §10); a save/reset simply overwrites/deletes rows.
- **Single-session prototype** — the admin gate is real, but (same limitation documented for every
  admin-only surface since Step 8B) it has never been exercised against an actual second,
  lower-privileged session; no fake user was created to manufacture that test.
- **No Dashboard Configuration for the Admin Dashboard itself** — `/admin`'s composition
  (`docs/V2-ORG-ADMIN-DASHBOARD.md`) is unaffected and unconfigurable; this phase only wires the
  Standard Dashboard.

## Future Team-Level Configuration

Not built, and not designed in detail here — flagged only as a plausible Phase 2 extension the current
schema doesn't block: a hypothetical `teamId` column alongside `workingRole` would let a specific team
override its own role's org-wide default, still without ever becoming an authorization signal. Nothing
in this phase's data model or resolution functions needs to change shape to accommodate that later; it
would be a new, additive lookup layered in front of the existing organization/role resolution, not a
rework of it.
