# V2 Application Shell Blueprint (Step 6A)

Status: **Implemented in Step 6B.** This document remains the approved architecture; see
`docs/V2-DESIGN-SYSTEM.md` for exactly what was built and four places implementation resolved a
question this document left open — noted inline below where relevant (§2, §8, §10, §13).

The product being designed is a **Product Planning & Delivery Platform** — not a CRM. The
attached CRM screenshot is a reference for information density, dark left-rail navigation, and
operational-software feel only; nothing here copies it literally.

---

## 1. CRM Reference Translation

What's being carried forward from the screenshot, and what isn't:

| CRM concept | V2 translation |
|---|---|
| Dark, persistent left rail | Dark nav rail (deep charcoal), but the **workspace stays light-neutral, not black** — only navigation/chrome goes dark. |
| Dense company table | Same density principle applied later to Initiatives, Reports, and any future list page — not built in this phase. |
| Muted colored tags (Enterprise, Upsell, Renewal…) | Already close to what exists: `ui/Badge` already renders light-bg/dark-text chips, not solid bright fills. Extend it with health-semantic variants (green/yellow/orange/red) rather than inventing a new chip component. |
| Compact rows, small avatars, inline metadata | Carried forward as the target density for future table pages — explicitly avoiding today's card-heavy, generously-spaced list style for anything list-shaped. |
| Top bar: workspace switcher, search, notification bell, avatar | Architecture for a `TopHeader` that can hold title/breadcrumbs/search/notifications/org-context/avatar/primary-action — **no search or notification functionality built**, slots only. |
| "Sales CRM / Company pipeline" product identity block | Temporary neutral identity already supported by the codebase: reuse the existing "GUIDED PLANNING" wordmark treatment from `LeftNav.tsx` (indigo, uppercase, small-caps) rather than inventing new permanent branding. |
| Nearly-black overall app | **Explicitly rejected** — only navigation/chrome is dark; the main workspace surface stays a light neutral so dense tables and forms stay readable, per the user's own instruction. |

---

## 2. Product Navigation Architecture

Confirmed four groups, exactly as specified:

```
PLAN
  Dashboard · Initiatives · Roadmap · Planning Workspace · Sprints & Releases

INTELLIGENCE
  Risks & Blockers · Decisions · Capacity & Cost · Reports

ORGANIZATION
  Teams & Stakeholders · Integrations · Activity

ADMIN (Organization Admin only — visibility gated on a future accessLevel field)
  Users & Roles · Organization · Dashboard Configuration · Settings
```

Super Admin has **zero** presence in this navigation — see §11.

This replaces the current flat 5-group scheme in `LeftNav.tsx` (Overview/Planning/Execution/
Outputs/Tools). The existing pattern of rendering a nav item **disabled** until its prerequisite
exists (today: initiative-scoped links disabled until an initiative exists/is generated) carries
forward as the mechanism for showing-but-disabling nav items whose pages aren't built yet.

**Implementation note (Step 6B):** the old flat nav also had "Guided Intake" and "Epics &
Stories" items with no slot in the 4-group list above. Resolution: Epics & Stories stays reachable
via `NavTabs` (already on every workspace page); Guided Intake stays reachable via the existing
"view intake answers" link already in `workspace/layout.tsx`'s header. Neither got a new top-level
slot — see `docs/V2-DESIGN-SYSTEM.md` §6.

---

## 3. Shell Hierarchy

```
AppShell (server-aware wrapper, decides bare vs. full chrome — existing mechanism, extended)
 └─ full chrome:
     Sidebar (dark nav rail)
      ├─ SidebarSection × 4 (PLAN / INTELLIGENCE / ORGANIZATION / ADMIN)
      │   └─ NavigationItem × N (icon + label + active/disabled state)
      └─ (brand mark, top of rail)
     TopHeader (chrome)
      ├─ PageHeader (title, breadcrumb, primary action slot)
      ├─ SearchInput slot (architecture only)
      ├─ Notification entry-point slot (architecture only, no functionality)
      └─ Org context + Avatar/user menu
     Content area
      └─ one of 5 Page Layout Types (§8) — chosen per route, not forced to one shape
```

The critical architectural change from today: `AppShell` currently only knows `bare` vs.
`full chrome`. It does not yet let a page declare *which kind* of full-chrome layout it wants —
every `workspace/*` page is hardcoded into one `max-w-6xl` framed card via
`workspace/layout.tsx`. Step 6B needs a second dimension: chrome (bare/full) × layout mode
(focused/contained/wide/dashboard/table) — see §8 and §15.

---

## 4. Surface / Color Tokens

Today: only two CSS variables exist (`--background`, `--foreground` in `globals.css`); everything
else is hardcoded Tailwind utility classes with no theming indirection. Tailwind v4 has no
separate config file — tokens live in an `@theme` block in `globals.css`. Proposed additions
(values are directional, not final hex — Step 6B tunes exact shades):

**Surfaces**
| Token | Role | Direction |
|---|---|---|
| `--surface-nav` | Sidebar background | Deep charcoal |
| `--surface-chrome` | Top header background | Graphite (slightly lighter than nav) |
| `--surface-app` | Main workspace background | Light neutral (unchanged in spirit from today's `#f7f7fb`) |
| `--surface-panel` | Cards/panels on the app surface | Subtle elevated neutral (near-white) |
| `--surface-hover` | Row/item hover | Faint neutral tint |
| `--surface-selected` | Active nav item / selected row | Low-saturation accent tint |
| `--border` | Dividers, card borders | Low-contrast but visible neutral |

**Text**
| Token | Role |
|---|---|
| `--text-primary` | Main content text |
| `--text-secondary` | Supporting text |
| `--text-muted` | Metadata, timestamps, placeholders |
| `--text-inverse` | Text on the dark nav surface |

**Accent**
| Token | Role |
|---|---|
| `--accent-primary` | Primary actions, active nav state, focus rings |
| `--accent-focus` | Focus outline |

**Recommendation: keep indigo as the sole accent.** It already appears 142 times across 52 files,
is the app's only accent color today, and is used specifically for primary actions/active states
— not scattered decoratively. That's already "limited and purposeful." Introducing a second
accent color would fragment an established, working visual language for no benefit.

**Health** (new — doesn't exist today)
| Token | Meaning |
|---|---|
| `--health-good` | Green — on track |
| `--health-attention` | Yellow — needs attention |
| `--health-risk` | Orange — approaching issue |
| `--health-critical` | Red — late / critical |

These become semantic tokens consumed by `ui/Badge`'s variant system (extending its existing
neutral/indigo/emerald/amber/red variants) — never hardcoded per-component hex/Tailwind-shade
values.

**Implementation note (Step 6B):** the health tokens were given deliberately distinct hues, not
aliases of the existing `emerald`/`amber`/`red` values `Badge` already uses for unrelated
value/risk/initiative-status badges — tokenizing health must not risk silently reskinning those.
The real domain type (`HealthStatus`) only has 3 values today; `health-warning` was still added as
a 4th, forward-provisioned token per this document's own explicit ask, but is documented as
reserved/unconsumed rather than force-mapped to something it doesn't mean. See
`docs/V2-DESIGN-SYSTEM.md` §10.

---

## 5. Typography

No type-scale tokens exist today (headings are ad hoc `text-xl`/`text-2xl` per component).
Proposed restrained scale, deliberately avoiding oversized headings:

| Level | Size direction | Used for |
|---|---|---|
| Page title | `text-xl`/`text-2xl`, semibold | Top of a page (e.g. "Initiatives") |
| Section title | `text-base`/`text-lg`, semibold | Panel/card group headers |
| Panel title | `text-sm`, semibold | Individual card/widget headers |
| Body | `text-sm` | Default content text |
| Label | `text-sm`, medium | Form field labels |
| Metadata | `text-xs`, muted | Timestamps, secondary info |
| Table header | `text-xs`, uppercase, tracked, muted | Column headers (matches existing `LeftNav` group-label treatment) |
| Table row | `text-sm` | Cell content |
| Chip | `text-xs`, medium | Badge/status text |

Nothing above `text-2xl` anywhere in the operational shell — this is enterprise software, not a
marketing page.

---

## 6. Density / Spacing

Two spacing modes, not one:
- **Card/panel spacing** (existing) — current `p-5`/`p-6`/`p-8` card padding stays as-is for
  forms, dashboards, and detail panels. No change needed here.
- **Table/row spacing** (new) — tighter, e.g. `px-3 py-2` per row, sized for scanning many
  records (matching the CRM reference's compact rows), not the generous spacing currently used
  for card lists like `home/page.tsx`'s initiative list.

Avoid: giant cards everywhere, oversized page headers, dashboard tiles eating half the screen —
all explicitly called out as anti-patterns to avoid carrying into denser future pages.

---

## 7. Component Inventory

**Reuse as-is:** `ui/Badge`, `ui/Card` + `CardTitle`, `ui/Modal`, `ui/ProgressBar` — all
genuinely adopted (8+ dashboard files, roadmap board, integrations), well-factored variant APIs.

**Refactor:**
- `LeftNav.tsx` → decompose into `Sidebar` (dark-nav shell) + `SidebarSection` (group label +
  children) + `NavigationItem` (icon/label/active/disabled) to support the new 4-group structure
  and future role-based ADMIN visibility.
- `home/page.tsx`'s inline `STATUS_BADGES` → migrate to `ui/Badge` (the component's own header
  comment already says it was extracted from this exact pattern — it just was never adopted here).
- `StartOverButton.tsx`'s inline confirm dialog → migrate to `ui/Modal`.
- `SprintReleaseStatus.tsx`'s raw `<table>` → seed content/structure for the new `DataTable`
  primitive rather than starting from nothing.
- `AppShell.tsx`'s inline avatar circle (`"D"` in a colored circle) → extract into `Avatar`.

**Build new (none exist today, confirmed via full-codebase search):** `Button`, `Input`,
`Textarea`, `Select` (a real styled primitive — today's only `<select>`, `SprintMoveSelect`, is a
one-off wired to a single API call, not reusable), `SearchInput`, `Table`/`DataTable` (header,
row, cell, empty state), `Panel` (evaluate first — `Card` may already cover this role; don't
duplicate without a concrete need), `Breadcrumb`, `PrimaryAction` (a header-level `Button` variant),
`FilterBar`, `EmptyState`, `Avatar`, `Divider`. `Tooltip` — lowest priority, add only where a
specific future page needs it.

**Do not build:** a separate `Chip` component — `ui/Badge` already serves that role.

---

## 8. Page Layout Types

Five shapes the shell must support, each already exemplified by an existing page:

| Layout type | Example today | Shape |
|---|---|---|
| **Focused/Setup** | `/initiatives/new`, `/initiatives/[id]/intake` (pre-generation), onboarding | Narrow centered card (`max-w-2xl`), bare chrome |
| **Contained** | `workspace/{features,epics,stories,sprints,capacity,executive}` | Framed card inside full chrome (`max-w-6xl`) |
| **Wide Canvas** | none yet — future Roadmap timeline, future Planning Workspace | Minimal max-width, full chrome, room for a horizontal/free-form canvas |
| **Dashboard Grid** | `/initiatives/[id]/dashboard` | `max-w-7xl`, multi-column tile grid, full chrome |
| **Data Table** | none yet — future Initiatives list, Reports | Full-width contained, edge-to-edge table, full chrome |

The shell must let a route **choose** its layout type rather than inheriting one hardcoded
wrapper. Today's `workspace/layout.tsx` forces every child (including Roadmap) into Contained —
that's the specific blocker §15 addresses.

**Implementation note (Step 6B):** `ContainedLayout` was scoped to wrap only
`workspace/layout.tsx`'s outer positioning div, not its inner bordered/shadowed `<main>` — that
inner card's `print:border-0 print:shadow-none` classes are load-bearing for
`workspace/executive/print` and are specific to that one layout, not a general primitive's
concern. See `docs/V2-DESIGN-SYSTEM.md` §8.

---

## 9. Route Mapping

| Nav item | Existing route | Future route/step |
|---|---|---|
| Dashboard | `/home` — the global Standard Dashboard (**Step 7B**, `docs/V2-STANDARD-DASHBOARD.md`); `/initiatives/[id]/dashboard` remains the separate initiative-scoped dashboard, unchanged | — |
| Initiatives | `/initiatives` (list) — moved here from `/home` in **Step 7B** so `/home` could become the Dashboard | Rework into a dense table (§8 Data Table) — future step |
| Roadmap | `/initiatives/[id]/workspace/roadmap` exists | Wide-canvas redesign — future step, needs §15 first |
| Planning Workspace | `/initiatives/[id]/workspace` exists (redirects to roadmap) | — |
| Sprints & Releases | `/initiatives/[id]/workspace/sprints` exists | — |
| Risks & Blockers | none | Future — no backing data model yet |
| Decisions | `DecisionsRequiredPanel` widget exists on the dashboard, no dedicated page | Future dedicated page |
| Capacity & Cost | `/initiatives/[id]/workspace/capacity` exists | — |
| Reports | `/initiatives/[id]/workspace/executive` ("Executive Presentation") exists, partial overlap | Future broader Reports section |
| Teams & Stakeholders | none | Future — depends on the `Team` model (`docs/V2-ARCHITECTURE.md` §10) |
| Integrations | `/integrations` exists | — |
| Activity | none | Future — depends on an `ActivityLog` model (`docs/V2-ARCHITECTURE.md` §10) |
| Users & Roles | none | Future — depends on `User.accessLevel` (not in schema yet) |
| Organization | none | Future — Org Admin |
| Dashboard Configuration | none | Future — Org Admin, kept explicitly separate from permissions (`docs/V2-ARCHITECTURE.md` §8) |
| Settings | none (only a demo-mode preference API exists) | Future — Org Admin |

No new routes are created in Step 6A or planned to be created in Step 6B — only the shell around
existing routes changes.

---

## 10. Standard User / Organization Admin Boundary

Both experiences live in the **same shell, same design system** — not two shells. PLAN,
INTELLIGENCE, and ORGANIZATION groups are visible to both. The ADMIN group (Users & Roles,
Organization, Dashboard Configuration, Settings) is visible only to an Organization Admin.

**Today, this gate cannot be real** — `User.accessLevel` doesn't exist in the schema yet
(`docs/V2-ARCHITECTURE.md` §10 lists it as a future addition, blocked on database isolation). Step
6B can build the *architecture* for this gate (a prop/check the `Sidebar` consults to decide
whether to render the ADMIN section) but cannot wire it to real authorization — there's nothing to
check yet. Document this explicitly rather than faking it with a hardcoded `true`/`false`.

Per `docs/V2-ARCHITECTURE.md` §8, Dashboard Configuration (presentation) must stay architecturally
separate from the permissions system (authorization) even though both live under ADMIN — the nav
grouping is not the authorization boundary.

**Implementation note (Step 6B):** the ADMIN group is rendered unconditionally (every item
disabled, labeled "Not yet available.") rather than hidden — there is no real `accessLevel` to
gate on yet, and the nav is presentation only. This is explicitly not a security boundary; see
`docs/V2-DESIGN-SYSTEM.md` §14 for the caveat.

---

## 11. Super Admin Boundary

Super Admin has **no presence in this shell at all** — not a nav item, not a route, not a hidden
section. Per `docs/V2-ARCHITECTURE.md` §7, it's a platform-operator console operating across
organizations, architecturally separate from any single organization's application. When it's
eventually built, it should live in its own route namespace and its own shell instance, not as a
mode of this one.

---

## 12. Responsive Behavior

The existing 2-state model already works and should be kept as-is for Step 6B:
- **`lg:` breakpoint (1024px) and above** (standard laptop through large desktop) — persistent
  expanded sidebar (`w-56`), exactly as today.
- **Below `lg:`** (narrow laptop/tablet) — off-canvas `MobileNavDrawer`, exactly as today
  (reuses the same `Sidebar`/`LeftNav` component, slide transform, backdrop, focus trap, already
  implemented).

**Not building now:** an icon-only "collapsed" intermediate rail. The instruction's own phrasing
("Expanded → Collapsed → Drawer") describes a reasonable future enhancement for users who want
more horizontal room at standard laptop widths, but the current 2-state model has no known problem
to justify adding a third state yet. Documented here as a future option, not a Step 6B deliverable.
Desktop remains primary; mobile is not designed for as a primary use case.

---

## 13. Onboarding Exclusions

Confirmed correct today and unchanged: `AppShell`'s `bare` check already excludes `/`, `/welcome`,
and everything starting with `/onboarding` — Organization Setup, Working Role selection, and the
pre-qualification screen all render bare, full-bleed, no sidebar. This stays exactly as-is.

**One real gap found, to fix in Step 6B (not fixed now — Step 6A changes no code):**
`/initiatives/[id]/intake` — which now hosts the Step 5B `PlanningQuestionnaire` (Sections 2–6) —
is **not** in the bare list. It renders full shell chrome today, which contradicts "the full
sidebar should NOT surround... the guided questionnaire."

**Recommended fix:** make bare-mode depend on generation status, not just profile existence —
bare while the initiative's intake is `!alreadyGenerated` (first-run guided setup, whether it's
the user's 1st or 5th initiative), full-shell once generated (editing an existing "living plan" is
a normal operational task and should keep the user's navigation context, per the Core Product
Goal). This also cleanly subsumes today's `/initiatives/new` `!hasProfile` special case as one
instance of the same underlying rule: *pre-generation setup is focused; post-generation work is
operational.*

**Implementation note (Step 6B):** implemented exactly as recommended, extracted as a pure,
unit-tested function (`isBareRoute()` in `src/components/shell/bareMode.ts`). One companion fix
was required: `ProductDirectionBootstrap.tsx`'s post-creation navigation was missing a
`router.refresh()` that every other status-changing action in the codebase already pairs with its
`router.push()` — without it, a freshly created initiative wouldn't yet be visible to the shell's
cached initiative list. Also decided: a genuinely not-found initiative ID falls through to the
normal shell rather than defaulting to bare, so a bad/stale link doesn't strand the user with no
navigation. See `docs/V2-DESIGN-SYSTEM.md` §13.

---

## 14. Integration / Settings Placement

- **Integrations** — real page today (`/integrations`, a provider/connection hub, not a bare
  list). Moves under the ORGANIZATION nav group. Keeps its current `IntegrationsHub` structure;
  adopts new primitives (`Panel`/`Table`) as they're built, but isn't rebuilt in Step 6B.
- **Settings** — doesn't exist yet. Lives under ADMIN. Planned as organized configuration
  sections (profile, organization defaults, planning defaults) rather than one flat page — matches
  the instruction that Settings must feel first-class, not bolted on. Not built until its own
  phase.

Both are first-class citizens of the same shell and layout-type system as Planning and Reports —
no separate "admin app" or "settings app."

---

## 15. Roadmap Wide-Canvas Requirement

**Current blocker, verified in code:** `src/app/initiatives/[initiativeId]/workspace/layout.tsx`
wraps every child route — including Roadmap — in a shared header/lock-bar/tabs frame plus a
`max-w-6xl` bordered card `<main>`. Roadmap's own "board" view is already a fixed 3-column CSS
grid *inside* that same frame — it has not broken out into a wide, free-form canvas.

**Step 6B action (architecture only, no Roadmap redesign):** give `workspace/layout.tsx` (or its
replacement) a way for an individual child page to opt out of the `max-w-6xl` card constraint and
request the Wide Canvas layout type (§8) instead, while still keeping the shared header/lock-bar/
tabs above it. This unblocks a future Roadmap redesign (Timeline/Milestones/Connections) without
requiring that redesign now, and without forcing every other workspace page to also go wide.

---

## 16. Step 6B Implementation Plan

Smallest logical, independently-shippable sequence:

1. **Introduce design tokens** — add the surface/text/accent/health CSS variables (§4) to
   `globals.css`'s `@theme` block. Additive; nothing consumes them yet.
2. **Refactor `LeftNav` into `Sidebar`/`SidebarSection`/`NavigationItem`**, apply the dark-nav
   tokens, restructure into the 4 approved groups. Items with no real route yet render disabled
   (existing pattern), matching §9's route mapping.
3. **Build `Button`/`Input`/`Textarea`/`Select`/`SearchInput` primitives** in `ui/`; begin
   migrating the highest-traffic hand-rolled buttons (AppShell, LeftNav, home page).
4. **Extend `ui/Badge`** with health-semantic variants; migrate `home/page.tsx`'s inline
   `STATUS_BADGES` to use it (fixes the known inconsistency).
5. **Build `TopHeader`/`PageHeader`/`Breadcrumb`/`PrimaryAction`** — slots for search/notifications
   included in the layout, no functionality behind them yet.
6. **Introduce the layout-mode mechanism** (§8) at the shell/route level; apply the Wide Canvas
   escape hatch to `workspace/layout.tsx` for Roadmap's future use (§15) — still no Roadmap
   redesign.
7. **Fix the intake bare-mode gap** (§13) — bare while `!alreadyGenerated`, shelled after.
8. **Build `Table`/`DataTable` primitives**, seeded from `SprintReleaseStatus.tsx`'s existing raw
   table.
9. **Migrate `StartOverButton`** to use `ui/Modal` instead of its inline dialog.
10. **Extract `Avatar`** from `AppShell`'s inline avatar circle.

No not-yet-built nav destinations (Risks & Blockers, Decisions, Reports, Teams & Stakeholders,
Activity, Users & Roles, Organization, Dashboard Configuration, Settings) are built in Step 6B —
they remain documented future destinations per §9, shown disabled in the nav until their turn.
