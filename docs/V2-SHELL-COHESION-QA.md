# V2 Shell Cohesion QA (Step 6C)

Status: **Verified and refined.** Builds on the implemented shell (`docs/V2-DESIGN-SYSTEM.md`,
`docs/V2-APPLICATION-SHELL-BLUEPRINT.md`). This phase made small, targeted cohesion fixes —
mainly introducing a real breadcrumb pattern that the shell had a component for
(`ui/Breadcrumb`) but never actually used anywhere — and verified the result with a full
browser walkthrough. No new features, no Roadmap/Dashboard/Admin redesign, no schema or
generation-engine changes.

## Existing Route Ownership

| Route | Owning nav item | Scope |
|---|---|---|
| `/home` | Dashboard (PLAN) — *changed in Step 7B, was Initiatives* | Global |
| `/initiatives` | Initiatives (PLAN) — *new in Step 7B* | Global |
| `/initiatives/new` | *(reached via "+ New", not a persistent nav item)* | Global (no initiative yet) |
| `/initiatives/[id]/intake` (pre-generation) | *(none — see Focused Flow Transition below)* | Initiative |
| `/initiatives/[id]/intake` (post-generation) | *(none — compensated by breadcrumb)* | Initiative |
| `/initiatives/[id]/review` | *(reached only right after Generate, not from nav)* | Initiative |
| `/initiatives/[id]/dashboard` | Dashboard (PLAN) | Initiative *(interim — see below)* |
| `/initiatives/[id]/workspace` | *(redirects to roadmap)* | Initiative |
| `/initiatives/[id]/workspace/roadmap` | Roadmap (PLAN) | Initiative |
| `/initiatives/[id]/workspace/features` | Planning Workspace (PLAN) | Initiative |
| `/initiatives/[id]/workspace/epics` | *(reached via in-workspace `NavTabs`, not top-level nav)* | Initiative |
| `/initiatives/[id]/workspace/stories/[storyId]` | *(reached from Epics & Stories)* | Initiative |
| `/initiatives/[id]/workspace/sprints` | Sprints & Releases (PLAN) | Initiative |
| `/initiatives/[id]/workspace/capacity` | Capacity & Cost (INTELLIGENCE) | Initiative |
| `/initiatives/[id]/workspace/executive` | Reports (INTELLIGENCE) | Initiative |
| `/initiatives/[id]/workspace/executive/print` | *(reached from Executive View, always bare)* | Initiative |
| `/integrations` | Integrations (ORGANIZATION) | Global |

Every functional destination in the sidebar was clicked and verified to (a) land on the correct
route, (b) highlight the correct nav item, and (c) show initiative context where applicable — see
the browser-walkthrough results below. No dead clicks: every enabled nav item leads somewhere
real; every disabled one shows an explanatory tooltip instead of a broken link.

## Global vs Initiative Scope

**Global** (no initiative context needed): Dashboard (`/home`), Initiatives (`/initiatives` as of
Step 7B), Integrations. These render with no breadcrumb — a breadcrumb on a single-level global
page would be overuse, not orientation.

**Initiative-scoped**: Dashboard, Roadmap, Planning Workspace, Sprints & Releases, Capacity &
Cost, Reports, and the guided questionnaire (pre- and post-generation). Every one of these now
shows a breadcrumb (see below) making the scope unambiguous — the user is never on one of these
pages wondering whose data they're looking at.

The distinction isn't just conceptual — the sidebar's initiative-scoped items are literally
disabled (not merely un-highlighted) until an initiative exists and is generated, which is a much
stronger signal than a real CRM's page-level breadcrumb alone would give.

## Initiative Context Pattern

**The core fix this phase**: `ui/Breadcrumb` existed since Step 6B but was never actually used
anywhere — every initiative-scoped page still had a plain "← Back to initiatives" link instead.
Introduced `WorkspaceBreadcrumb` (`src/components/workspace/WorkspaceBreadcrumb.tsx`), a small
client component rendering `Initiatives → {initiative name} → {current section}`, and adopted it
on every initiative-scoped page:

- **Workspace pages** (roadmap/features/epics/sprints/capacity/executive, via the shared
  `workspace/layout.tsx`): third segment is derived automatically from the URL, sharing
  `NavTabs`' own slug→label mapping (`currentTabLabel()`, exported from `NavTabs.tsx`) so the
  breadcrumb and the tab strip below it can never disagree on what a section is called.
- **Dashboard**: two segments only (`Initiatives → {name}`) — a third "→ Dashboard" crumb would be
  redundant since the dashboard *is* the initiative's landing page; the name renders as the
  current (non-linked) page instead.
- **Guided Intake** (both pre- and post-generation): explicit third segment "Guided Intake" via a
  `trailOverride` prop, since intake isn't one of `NavTabs`' six sections.
- **New initiative bootstrap**: a plain two-segment `Initiatives → New Initiative` (no real
  initiative exists yet, so the generic `ui/Breadcrumb` is used directly rather than
  `WorkspaceBreadcrumb`).

This is now the shell's standard answer to "which initiative am I looking at" — see the new rule
added to `docs/V2-DESIGN-SYSTEM.md`.

## Dashboard Interim Behavior

The **Dashboard** nav item stays exactly as it already behaved: it links to the *current*
initiative's `/initiatives/[id]/dashboard` (disabled until an initiative exists and is generated),
not a new global landing page. This is the safest interim mapping — it's the only real dashboard
route that exists, and building a global dashboard now would be exactly the Step 7 work this phase
is told not to start early. The nav item's own disabled-state tooltips ("Create an initiative
first." / "Available once this initiative's plan is generated.") already make the interim,
initiative-scoped nature clear rather than implying a global home that isn't there yet.

**Superseded in Step 7B** (`docs/V2-STANDARD-DASHBOARD.md`): the Standard Dashboard now exists at
`/home`, and the **Dashboard** nav item points there unconditionally — no longer scoped to, or
disabled by, the current initiative. `/initiatives/[id]/dashboard` is unchanged and still reachable
from the initiative summary widget and the initiative-scoped breadcrumb.

## Initiatives Interim Behavior

The **Initiatives** nav item already pointed at `/home`, the existing initiative list — genuinely
global (lists every initiative for the user, not scoped to one). No change was needed here; it
already fits the target architecture (`docs/V2-APPLICATION-SHELL-BLUEPRINT.md` §9's route mapping)
and there is no duplicate listing logic to consolidate. `/home` itself already adopted `PageHeader`
in Step 6B.

**Superseded in Step 7B**: `/home` became the Standard Dashboard, so the initiative list moved,
unchanged, to `/initiatives`. The **Initiatives** nav item now points there instead.

## Future Navigation Behavior

Unbuilt destinations (Risks & Blockers, Decisions, Teams & Stakeholders, Activity, and the entire
ADMIN group) already rendered disabled with distinct copy from data-driven-temporary items ("Not
yet available." vs. "Create an initiative first."/"Available once this initiative's plan is
generated.") as of Step 6B — verified still correct, no changes needed. No elaborate placeholder
pages were added; a disabled nav item with an explanatory tooltip remains the smallest safe
treatment, and it was already in place.

## Admin Presentation

Confirmed unchanged from Step 6B: the ADMIN group renders unconditionally (every item disabled)
because there is no real `User.accessLevel` to gate on yet. This remains presentation only — no
authorization logic was added or implied. It's visible during prototype testing purely because
hiding it would require a real permission check that doesn't exist yet, not because it's meant to
look "available soon" in a way that implies imminent unlock.

## Role Emphasis

Working Role continues to affect only guidance copy inside the questionnaire (`docs/V2-QUESTIONNAIRE-IMPLEMENTATION.md`)
— it has no effect on the sidebar, which is identical for every Working Role. No shell variants
were introduced or needed.

## Focused Flow Transition

Verified in both directions with a real browser session:
- **Pre-generation** guided questionnaire (`/initiatives/[id]/intake` while `!alreadyGenerated`):
  bare, no sidebar — confirmed via `nav.no-print` absent from the DOM.
- **Post-generation** "living plan" editing of the same route: shelled, full sidebar — confirmed
  `nav.no-print` present. Also confirmed **no sidebar item falsely shows as active** here (honest,
  since Guided Intake was deliberately never given a top-level nav slot per Step 6B) — the new
  breadcrumb is exactly what compensates for that, giving textual orientation ("Initiatives →
  {name} → Guided Intake") where a highlighted nav item would otherwise have.
- Onboarding (`/`, `/welcome`, `/onboarding*`) unchanged, still bare — not re-tested in depth since
  Step 6C made no changes to those routes.

## Visual Cohesion Findings

Screenshots compared across Home, an initiative Dashboard, Roadmap, Planning Workspace, Sprints,
Capacity & Cost, and Integrations at 1440px. Findings:
- **Real inconsistency found and fixed**: `DashboardHeader` and `workspace/layout.tsx`'s header
  each independently hand-rolled their own title/description/action layout, slightly differently
  from each other and from `PageHeader` (adopted by `/home` and `/integrations` in Step 6B). Both
  now compose the same `PageHeader` primitive — same title treatment, same description slot, same
  action-slot placement — while keeping their own domain-specific content (methodology switcher,
  Jira sync panel, baseline-approved badge) exactly as it was.
- **Real inconsistency found and fixed**: two inline badge-style spans (the "Baseline approved"
  pill in both the dashboard and workspace headers) were hand-rolled with raw
  `bg-emerald-100 text-emerald-800` classes instead of the shared `Badge` component — both now use
  `<Badge variant="emerald">`.
- **Evaluated, not changed**: `Integrations` already had a well-built, professional card/hub
  layout (search, category filters, provider cards) predating this phase — only its outer wrapper
  and header were touched (now `ContainedLayout` + `PageHeader`), matching the rest of the shell
  without redesigning the hub itself.
- No page still "looks like Prototype 1" in a way that stands out — the dark sidebar, `PageHeader`
  title treatment, and card/border language are now consistent across every page reached from
  navigation.

## Responsive Findings

Re-tested the full walkthrough (Home → Dashboard → Roadmap → Capacity & Cost → Integrations) at
1180px (standard laptop) and 820px (narrow/tablet), in addition to 1440px (large desktop) — no
horizontal overflow on any page at any width, sidebar/drawer behavior unchanged and consistent
across all of them (persistent sidebar ≥1024px, off-canvas drawer below it, verified already in
Step 6B and reconfirmed here across more pages). Breadcrumbs render on one line and were not
observed to wrap awkwardly at any tested width, though very long initiative names on narrow
viewports weren't specifically stress-tested — noted under Deferred.

## Deferred

- Long initiative-name wrapping/truncation in the breadcrumb at narrow widths — not stress-tested
  with an unusually long name.
- "Guided Intake" still has no persistent top-level nav slot (unchanged design decision from Step
  6B) — the new breadcrumb addresses the orientation gap this created, but a future phase could
  reconsider giving it a real nav slot if user testing shows the breadcrumb isn't sufficient.
- Everything explicitly out of scope per this phase's brief: Standard Dashboard redesign, Org
  Admin Dashboard, new Roadmap views, Risks/Decisions/Reports/Teams systems, Settings
  functionality, Super Admin, real Jira/Azure integration, real auth/RBAC.
