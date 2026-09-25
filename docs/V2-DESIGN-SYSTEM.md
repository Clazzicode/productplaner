# V2 Design System (Step 6B)

Status: **Implemented.** Builds on the approved `docs/V2-APPLICATION-SHELL-BLUEPRINT.md`. This
document records what was actually built. The generation engine, Prisma schema, and existing
routes are unchanged — this phase only changed shared shell/UI code.

## 1. Implemented Visual Direction

A dark, deep-charcoal left navigation rail against a light-neutral main workspace — not an
all-black product. The CRM screenshot's own top bar is white, not dark, so the top header/chrome
stayed light too; only the nav rail went dark. Indigo remains the sole accent (unchanged from
Prototype 1 — already well-established, not replaced).

## 2. Tokens

New CSS custom properties in `src/app/globals.css`'s `:root` + `@theme inline` blocks (Tailwind
v4 — no separate config file). Existing `--background`/`--foreground` untouched; everything below
is additive.

| Category | Tokens |
|---|---|
| Surfaces | `--surface-nav`, `--surface-nav-hover`, `--surface-nav-selected`, `--surface-chrome`, `--surface` (= app background), `--surface-panel`, `--border-subtle`, `--border-nav` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`, `--text-inverse-muted`, `--text-disabled` |
| Accent | `--accent`, `--accent-hover` — tokenizes the existing indigo-600/700, not a new color |
| Health | `--health-good`, `--health-attention`, `--health-warning`, `--health-critical` |

Each maps to a Tailwind utility color via `@theme inline` (e.g. `--color-nav` → `bg-nav`,
`text-nav`), so components consume them as ordinary Tailwind classes.

## 3. Surface Hierarchy

`nav` (darkest) → `chrome`/`panel` (light, used for the top bar and cards) → `surface` (app
background, lightest). Hover/selected states on the dark nav use `--surface-nav-hover`/
`--surface-nav-selected`, distinct from the light-side hover states already used elsewhere in the
app (e.g. `hover:bg-neutral-50`).

## 4. Typography

No new type-scale component was introduced — existing text sizes (`text-2xl` page titles down to
`text-xs` chips/metadata) were kept and just re-pointed at the new text-color tokens where
touched. Nothing in the shell exceeds `text-2xl`.

## 5. Spacing / Density

Two intentionally different densities exist side by side: existing card/panel padding (`p-5`/`p-6`/
`p-8`, untouched) for forms and dashboards, and a new, tighter row density (`px-3 py-2`) in the new
`Table` primitive for future dense list pages. `SprintReleaseStatus.tsx`'s existing raw table was
evaluated and deliberately **not** migrated to the new primitive — its bespoke tight padding
(`py-1.5`/`py-2`, no horizontal padding, already inside a padded `Card`) would have gained
unwanted horizontal padding from `Table`'s defaults. It remains the structural inspiration for the
primitive, not a required adopter of it.

## 6. Sidebar Architecture

`Sidebar` (dark container + brand mark) → `SidebarSection` (group label + items) →
`NavigationItem` (link or disabled span, active-state aware) — all new, in
`src/components/shell/`. `LeftNav.tsx` is now a thin composition of these three, keeping its exact
external API (`{initiatives: NavInitiative[]}`) so `MobileNavDrawer.tsx` needed zero changes — it
still just imports and renders `LeftNav`.

Four groups, per the approved blueprint:
- **Plan**: Dashboard, Initiatives (`/home`), Roadmap, Planning Workspace (→ `workspace/features`),
  Sprints & Releases
- **Intelligence**: Risks & Blockers (not yet available), Decisions (not yet available), Capacity &
  Cost, Reports (→ `workspace/executive`)
- **Organization**: Teams & Stakeholders (not yet available), Integrations, Activity (not yet
  available)
- **Admin**: Users & Roles, Organization, Dashboard Configuration, Settings — all not yet
  available, rendered unconditionally (see §14)

**"Guided Intake" and "Epics & Stories"** (present in the old flat nav) are deliberately not
top-level items: Epics & Stories is already reachable via `NavTabs` on every workspace page, and
Guided Intake is reachable via the existing "view intake answers" link already in
`workspace/layout.tsx`'s header — present on every workspace page, so effectively always one click
away regardless of which nav item brought you there. This is an intentional decision, not an
oversight.

**Disabled-item copy is now distinguished by cause**: initiative-scoped items still show real,
data-driven reasons ("Create an initiative first" / "Available once this initiative's plan is
generated"), while permanently-not-yet-built items show "Not yet available." — so a stub doesn't
read as a bug.

## 7. Header Architecture

`TopHeader` (in `src/components/shell/`) replaces two inline `<header>` blocks that used to live
directly in `AppShell.tsx`. It is **not** a generic two-slot component — desktop and mobile render
genuinely different structure (desktop: full initiative-switcher + "+ New" + account-actions row;
mobile: hamburger + truncated current-initiative name + bare avatar), matching what `AppShell`
already did, just extracted into one named, reusable component.

`PageHeader` (in `src/components/ui/`) is a separate, page-content-level component
(eyebrow/title/description/breadcrumb-slot/primary-action-slot) — distinct from the shell-level
`TopHeader`. Adopted on `/home` as its first real usage; `description` accepts `React.ReactNode`
(not just `string`) so a page can compose a richer metadata line (badges, links, inline switchers)
as its description, as `DashboardHeader` and `workspace/layout.tsx` both do (Step 6C).

**Initiative-context breadcrumb rule (Step 6C)**: every initiative-scoped page shows
`Initiatives → {initiative name} → {current section}` via `WorkspaceBreadcrumb`
(`src/components/workspace/WorkspaceBreadcrumb.tsx`), placed directly above `PageHeader`. The third
segment is omitted when the page *is* the initiative's landing page (the Dashboard) rather than
repeating the page name redundantly. Global, single-level pages (`/home`, `/integrations`) do not
get a breadcrumb — this is not "add a breadcrumb everywhere," it's specifically how the shell
communicates initiative scope. See `docs/V2-SHELL-COHESION-QA.md` "Initiative Context Pattern."

## 8. Page Layout Modes

`src/components/layout/PageLayouts.tsx` — five pure positioning wrappers, no visual chrome of
their own:

| Component | Max width | Adopted by |
|---|---|---|
| `FocusedLayout` | `max-w-2xl` | `/initiatives/new`, `/initiatives/[id]/intake` |
| `ContainedLayout` | `max-w-6xl` | `workspace/layout.tsx`'s **outer positioning div only** — see below |
| `DashboardLayout` | `max-w-7xl` | `/initiatives/[id]/dashboard` |
| `WideLayout` | `max-w-[1600px]` | none yet — ready for a future Roadmap redesign |
| `TableLayout` | full-width | none yet — ready for a future dense Initiatives/Reports page |

**`ContainedLayout` deliberately wraps only `workspace/layout.tsx`'s outer positioning div**, not
its inner bordered/shadowed `<main>`. That inner card's `print:border-0 print:shadow-none` classes
are load-bearing for `workspace/executive/print` (which has no layout override of its own and
renders inside that exact `<main>`) — folding print-specific behavior into a general-purpose
primitive would have been the wrong direction. `WideLayout`/`TableLayout` exist, compile, and are
ready to use, but are intentionally not applied anywhere yet — no Roadmap or Initiatives-table
redesign is in scope this phase.

## 9. Reusable Primitives

**Reused as-is**: `Badge`, `Card`/`CardTitle`, `Modal`, `ProgressBar`.

**New, in `src/components/ui/`**: `Button` (primary/secondary/ghost/destructive), `Input`,
`Textarea`, `Select`, `SearchInput` (presentational only — no global search exists to wire it to),
`Avatar` (extracted from two previously-duplicated inline avatar circles, now used by both),
`Breadcrumb`, `EmptyState`, `FilterBar` (presentational shell only), `Table`/`TableHead`/
`TableHeaderCell`/`TableBody`/`TableRow`/`TableCell`, `PageHeader`.

**New, in `src/components/shell/`**: `Sidebar`, `SidebarSection`, `NavigationItem`, `TopHeader`.

## 10. Badge / Status Semantics

`Badge`'s existing variants (`neutral`/`indigo`/`emerald`/`amber`/`red`) and its three existing
domain-mapping helpers (`valueBadgeVariant`, `riskBadgeVariant`, `healthBadgeVariant`) are
completely unchanged — same signatures, same call sites, same behavior.

Four new variants were added — `health-good`/`health-attention`/`health-warning`/
`health-critical` — using **distinctly-named** tokens (not aliases of the existing `emerald`/
`amber`/`red` hues, which are shared by unrelated value/risk/initiative-status badges). This
matters because the domain's real `HealthStatus` type (`src/lib/generation/health.ts`) only has
**three** values (`on_track`/`attention`/`at_risk`) — `healthBadgeVariant` still returns
`emerald`/`amber`/`red` exactly as before. **`health-warning` is not consumed by any code today** —
it's provisioned for a future 4th health tier the user's instructions explicitly asked for as a
forward-looking system, and is documented here as reserved rather than silently wired to something
it doesn't mean.

## 11. Data-Table Foundation

`Table`/`TableHead`/`TableHeaderCell`/`TableBody`/`TableRow`/`TableCell` in `src/components/ui/
Table.tsx` — compact density (`px-3 py-2`), hover state, an optional `selected` prop on `TableRow`,
no built-in sorting/filtering/pagination (a page wires that itself). Not yet adopted by any real
page — see §5 for why `SprintReleaseStatus` specifically wasn't migrated to it.

## 12. Responsive Behavior

Kept the existing, working two-state model exactly as it was: persistent expanded sidebar at
`lg:` (1024px) and above, off-canvas `MobileNavDrawer` below it (same component, reusing the same
`Sidebar`/`LeftNav` — verified in this phase's browser pass at 1440px, 1180px, and 820px widths,
including drawer open/close and Escape-to-close). No icon-only "collapsed" rail was added — the
current 2-state model has no problem that would justify a third state yet; documented as a future
option in the approved blueprint, not built here.

## 13. Focused-Flow Exclusions

`/`, `/welcome`, `/onboarding*`, and `*/executive/print` stay bare exactly as before — unchanged.

**The one real fix in this phase**: `/initiatives/[id]/intake` is now bare only while the
initiative hasn't been generated yet (first-run guided setup), and shelled once generated (living
plan editing keeps navigation context) — extracted as a pure, unit-tested function,
`isBareRoute()` in `src/components/shell/bareMode.ts`. This required no new data plumbing: `AppShell`
already receives each initiative's `status` and already parses the current initiative ID from the
URL. A companion fix was needed and made:
`src/components/questionnaire/ProductDirectionBootstrap.tsx`'s post-creation `router.push()` was
missing the paired `router.refresh()` that every other status-changing action in the codebase already
has — without it, a brand-new initiative wouldn't yet appear in the shell's cached initiative list,
making the bare-mode decision for a fresh initiative correct by cache-staleness coincidence rather
than real data. Both are covered by `bareMode.test.ts`, including the case where an initiative ID
genuinely can't be found (falls through to the normal shell rather than stranding the user in a
bare, unstyled 404).

## 14. Authorization Boundary

The **Admin** nav group is rendered unconditionally, every item disabled with "Not yet
available." — `User.accessLevel` doesn't exist in the schema yet (`docs/V2-ARCHITECTURE.md` §10),
so there is nothing real to gate it on. This is presentation only. It must never be read as, or
extended to function as, an authorization check — real gating arrives only once `accessLevel` is a
real, persisted field.

## 15. Known Temporary Limitations

- Admin nav visibility is not real authorization (§14).
- `health-warning` is a reserved token with no current consumer (§10).
- `WideLayout`/`TableLayout` exist but aren't applied anywhere yet (§8).
- `SprintReleaseStatus`'s table intentionally wasn't migrated to the new `Table` primitive (§5).
- `StartOverButton`'s migration to `Modal` introduced small, accepted visual deltas: an X-close
  button and click-outside-dismiss that weren't there before, and a generic heading style instead
  of the previous red-tinted one.
- "Guided Intake" has no persistent top-level nav entry — relies on the inline "view intake
  answers" link (§6).

## 16. What Step 6C Must Validate Next

- Whichever page first needs `WideLayout` or `TableLayout` should confirm they behave as expected
  under real (not placeholder) content before broader adoption.
- Any future Admin functionality must land its own real authorization check before the Admin nav
  items are ever made clickable — the current disabled state must not be quietly "enabled" without
  that.
- If a 4th health tier is ever added to the real domain model, `health-warning` is already
  provisioned and ready — confirm the mapping matches intent rather than guessing.
- Revisit whether "Guided Intake" deserves a first-class nav slot once real usage data exists on
  whether users can reliably find the inline link.
