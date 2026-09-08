# V2 Roadmap Timeline — Step 9B

Implements the Timeline view designed in `docs/V2-ROADMAP-ARCHITECTURE.md` (Step 9A). Read-only,
zero schema changes, real data only. Milestones and Connections stay explicit "coming soon"
states — not built here.

---

## 1. Purpose

Replace the roadmap page's old, misleadingly-named 2-way List/"Timeline" toggle — where
"Timeline" was actually a phase Kanban board — with a real horizontal time-axis roadmap, and
begin the page's evolution into its final 3-view shape: **Timeline** (built), **Milestones**
(disabled, Step 9C), **Connections** (disabled, Step 9D).

## 2. Visual Translation

From the one-year-roadmap reference: horizontal time across the top, groupings (Phase) down the
left in a frozen column, work as horizontal blocks whose length is real duration, sticky header,
horizontal scroll for navigation. Deliberately **not** carried over: the reference's bright
per-item colors (color here is reserved for health only, per the design system's status-color
rules) and its collaborative-cursor UI (not applicable). The result reads as a roadmap board with
a time axis, not a project-management Gantt chart — no dependency connector lines, no day-level
scheduling precision, no resource bars.

## 3. Feature as Roadmap Item

Confirmed from the Step 9A recommendation: **Feature** (`ArtifactLayer{type:"feature"}`, 1:1 with
a `Capability` via `sourceCapabilityId`) is the Timeline block. Epics/Stories never render as
independent blocks — they're drill-down content in the detail drawer (§11). See
`docs/V2-ROADMAP-ARCHITECTURE.md` §3 for the full reasoning; nothing about it changed during
implementation.

## 4. Timeline Date Derivation

Implemented in `src/lib/roadmap/timelineDerivation.ts` → `deriveFeatureSchedule()`, called once
per Feature by the data loader (`src/lib/roadmap/loadRoadmapTimelineData.ts`):

- **Primary rule**: `start` = earliest `Sprint.startDate`, `end` = latest `Sprint.endDate`, across
  every distinct Sprint that Feature's Stories (`sourceCapabilityId` match, joined via `sprintId`)
  actually landed in. This is real, persisted schedule data — never invented.
- **Kanban fallback**: `continuous_flow` methodology never creates `Sprint` rows, so a Feature
  with zero spanned Sprints falls back to its `roadmap_phase.contentJson` cached date range
  (the phase's own throughput-packed range) — coarser, but still real.
- **Unscheduled**: a non-Kanban Feature with no Stories yet assigned to a Sprint gets no date at
  all (`start`/`end` = `null`) and renders in the Unscheduled lane (§12) instead of guessing a
  position.
- Nothing derived here is persisted anywhere — it's recomputed on every page load.

Verified end-to-end against real generated data (browser QA, §16): a Feature spanning one Sprint,
a Feature spanning multiple Sprints (earliest start / latest end correctly picked), the Kanban
phase-range fallback path, and a genuinely unscheduled Feature (Story with a null `sprintId`) all
render correctly — see `src/lib/roadmap/__tests__/timelineDerivation.test.ts`.

## 5. Phase Grouping

Only grouping mode built, exactly as Step 9A recommended: **Phase** (`TimelinePhaseGroup.tsx`),
one lane-group per `roadmap_phase`, in phase order. Team/Initiative/other groupings are not
built — Team has no backing data (`docs/V2-ROADMAP-ARCHITECTURE.md` §2), and Initiative grouping
is out of scope for a single-initiative page.

## 6. Quarter / Year Zoom

Built in `src/lib/roadmap/timelineScale.ts` (`buildTimeAxis`, `PX_PER_DAY`). One refinement made
during implementation, worth recording since it reads slightly differently than a literal "zoom
window" might suggest: **zoom changes pixel density only, never the rendered date range.** Both
Quarter (20px/day) and Year (9px/day — see §16 for why not the originally-planned 6) always
render the Timeline's full scheduled span (every Phase, every Feature); horizontal scroll is how
a user moves through it. This directly matches the product direction's own wording — "Year: more
compressed blocks," "Quarter: wider time cells" — as a density change, not a windowed 3-month
view with quarter-to-quarter navigation (which the instructions never asked for and would have
added real scope: prev/next controls, an "anchor quarter" concept, features landing outside the
visible window). No Month zoom — not attempted, avoids a calendar engine.

Header (`TimelineTimeHeader.tsx`): a quarter-grouping row above a month row, month labels only
(e.g. "Aug"), no week/day precision in either zoom level — this is strategic planning, not
day-level scheduling, per the product direction.

## 7. Timeline Block

`TimelineBlock.tsx`. On-block content, adaptive to available width rather than fixed:

- Title (always, truncated if needed).
- MVP marker: full `MVP` pill when the block is ≥100px wide; a compact `★` mark otherwise — see
  §16 for why this became width-adaptive rather than always-on.
- Health: a left-edge 4px colored strip (`border-l-4 border-health-*`) plus a small dot in the
  meta row — never a full-block fill, per the design system's status-color rules.
  Absent entirely (no strip, no dot — falls back to a neutral gray edge) when the Feature has no
  derivable health (unscheduled), rather than guessing one.
- Dependency count (`🔗 N dependencies`): only when the block is ≥90px wide and the Feature has
  at least one outgoing dependency.

Business value and risk are **not** on the block (available in the detail drawer) — kept off to
avoid overloading an already width-constrained surface, matching "do not overload the block."

## 8. Health

Reuses `scheduleHealth()` (`src/lib/generation/health.ts`) and `computeCapacityForecast()`
(`src/lib/generation/capacityForecast.ts`) verbatim — no second health engine. New pure function
`deriveFeatureHealth()` (`src/lib/roadmap/timelineDerivation.ts`) extends the real 3-value
`HealthStatus` to a 4th tier **only where the data actually supports a real distinction**:

1. Base tier = `"at_risk"` if any Sprint this Feature's Stories fall into is itself
   over-allocated (`computeCapacityForecast`, the same signal Release/Initiative health already
   use — just scoped to this Feature's own spanned Sprints); otherwise
   `scheduleHealth(featurePoints, spannedCapacity)` as usual (`on_track` / `attention` pass
   through unchanged).
2. When the base tier is `"at_risk"`, split it by one additional real signal
   `scheduleHealth` doesn't have: has this Feature's derived **end date** already passed?
   - Not yet due → `"warning"` (orange, "approaching issue" — matches the requested language
     exactly).
   - Already past due → `"critical"` (red, "overdue").

This is the **first real consumer of the reserved `health-warning` token**
(`docs/V2-DESIGN-SYSTEM.md` §10) — `timelineHealthTokenVariant()` was added to `Badge.tsx`
(additive; the existing 3-tier `healthTokenVariant()` is untouched) to map all four. Verified in
browser QA: a Feature over-capacity-but-future rendered orange/"Approaching issue", a
deliberately-backdated over-capacity Feature rendered red/"Overdue", and normal Features rendered
green/"On track" — all three distinguishable at a glance in both the block strip and the drawer
badge.

## 9. Dependencies

`CapabilityDependency` only, exactly as designed — a small `🔗 N dependencies` indicator on the
block (§7) and, in the detail drawer, both directions spelled out by name: **Depends on** and
**Depended on by** (the reverse map, computed in the loader from every Capability's
`dependsOnEdges`, since the codebase's existing `TraceCapabilityView` only carries the forward
direction). No connector lines drawn on the Timeline — reserved for Connections (Step 9D).

## 10. Filters

`RoadmapFilters.tsx` — MVP toggle, business value, risk level, phase, all backed by real
`Capability` fields (`docs/V2-ROADMAP-ARCHITECTURE.md` §2/§10). No Team/Owner/Status filters —
that data doesn't exist. Filters combine with AND (`src/lib/roadmap/timelineFilters.ts`,
`matchesFilters`), apply identically to the grid, the Unscheduled lane, and the mobile list (one
filter state, three render surfaces), and show a live "N of M features" count plus a Clear
filters action. An explicit "No Features match the current filters" message replaces a silently
empty grid.

## 11. Detail Drawer

`RoadmapDetailDrawer.tsx` — right-side panel on desktop (`sm:max-w-md`), full-width sheet below
640px (`w-full`), opened by clicking a block, a mobile list row, or an Unscheduled chip; closes
back to the same scroll/filter/zoom state (it's local component state, untouched by
opening/closing the drawer). Content, all real/derived, nothing fabricated:

- **Feature**: title, description, MVP/value/risk/health badges.
- **Timing**: phase, derived start, derived end, basis (which of the §4 rules produced the
  dates), release name + target date.
- **Dependencies**: depends on / depended on by, both by name.
- **Delivery**: epic count, story count, Sprint span (e.g. "Sprint 2–4").
- **Actions**: "Open Feature Hierarchy" and "View Epics & Stories" — real links to the existing
  workspace tabs, not new routes.

No scheduling edit affordances anywhere in the drawer — read-only, per Step 9B's scope.

## 12. Unscheduled Features

`UnscheduledFeatures.tsx` (desktop/tablet) and the "Unscheduled" section in
`TimelineMobileList.tsx` (phone). Every Feature the data loader can't place on the axis — no
Sprint-scheduled Stories yet, and (for Kanban) no phase range yet either — renders here instead of
at a guessed position, with an explicit explanation ("No Stories have landed in a Sprint yet…").
Clicking one opens the same detail drawer as a scheduled block.

## 13. Authorization

No new permission logic. The Roadmap page (and every workspace sub-page) is already gated by one
`requireInitiativeView` call in `workspace/layout.tsx`; Timeline is purely a new render path over
that same authorized data. There is no write path anywhere in the Timeline component tree — no
`apiFetch` call, no mutation — so "View can inspect, Edit doesn't unlock new behavior yet" holds
by construction, not by a permission check that had to be added.

## 14. Responsive Behavior

- **Desktop / laptop**: full grid — sticky left column, sticky time header, horizontal scroll,
  zoom control, detail drawer as a right-side panel.
- **Tablet** (≥640px, e.g. 768px): the same grid; it degrades gracefully at this width without
  any special-casing (verified in browser QA at 768px).
- **Mobile** (<640px): the grid is replaced — not compressed — by `TimelineMobileList.tsx`, a
  vertical card list grouped by phase, each card showing title, MVP, health, date range,
  dependency count, and opening the same detail drawer (now a full-width sheet) on tap. The zoom
  control and time-axis grid are hidden entirely below the `sm` breakpoint
  (`hidden sm:block` / `sm:hidden` — pure CSS, no JS viewport detection, so there's no
  hydration-mismatch risk). This exists because the first browser QA pass at 375px showed exactly
  the "unreadable blocks" outcome the product direction warned against — the fix is a real
  component, not a CSS tweak to the grid (§16).

## 15. Legacy RoadmapBoard Status

**Kept, unchanged, still fully functional — moved, not deleted or hidden.** `RoadmapBoard.tsx`
(the phase Kanban board with real drag/drop, `POST /api/capabilities/[capId]/move-phase`) and the
pre-9B List view (`EditableArtifact`-based inline title/body editing) are both real, working
functionality Timeline doesn't replace yet:

- List is still the only way to edit the Roadmap's and each Phase's title/body text.
- Board is still the only way to move a Capability between phases — Timeline is read-only in
  9B (§"Important: Do Not Build Drag/Drop" / `docs/V2-ROADMAP-ARCHITECTURE.md` §11).

Both are reachable via a small, clearly-subordinate "Editing tools" row (`RoadmapLegacyViews.tsx`)
below the primary Timeline/Milestones/Connections switcher — not equal-weight tabs, so the product
direction's "not List / Timeline-that-is-really-Kanban" concern doesn't resurface. The old
`RoadmapViewToggle.tsx` (the 2-way switcher) was deleted — it was pure presentation with no unique
logic, fully superseded by `RoadmapViewSwitcher.tsx`. Board's own internal "Timeline board isn't
available for Agile/Scrum" copy was relabeled "Board isn't available…" to stop it referring to
itself by the name that now belongs to the real Timeline.

## 16. Known Limitations

- **Year zoom density tuned once against real data, not exhaustively.** The first browser QA pass
  at the originally-planned 6px/day left short (2-week-Sprint) blocks reading as "MVP A…" —
  truncated past usefulness. Fixed by raising Year to 9px/day and making MVP-badge/dependency-text
  rendering width-adaptive (§7) rather than lying about duration by inflating the minimum block
  width. Real edge case still possible: a Feature spanning a single very short Sprint at Year zoom
  may still show only a truncated title with no MVP/dependency indicators — mitigated by the
  block's `title` tooltip and one click into the detail drawer, not eliminated.
- **Auto-scroll-to-today** was added after QA showed the canvas' default scroll position could
  strand the current Phase off the right edge when the axis start is pulled far left by an
  outlier date. It centers "today" roughly a third from the left on load and on zoom change; it
  does not persist or restore a user's manual scroll position across a filter change.
- **End-to-end browser verification covered Hybrid/Waterfall methodology** (Sprint-driven dates,
  the primary path) plus the Kanban phase-range fallback logic (unit-tested in
  `timelineDerivation.test.ts`), but the Kanban fallback was not separately walked through in the
  browser against real Kanban-generated data — only Hybrid was.
- **`ArtifactLayer.externalRef` sync indicator** (`docs/V2-ROADMAP-ARCHITECTURE.md` §19) is not
  surfaced on the block or in the drawer — deferred, not needed for 9B.
- Filters are single-select per field (MVP is a toggle, Value/Risk/Phase are single-choice
  dropdowns) rather than true multi-select-per-field — matches "multiple filters if
  implementation is simple," where "multiple" means multiple *fields* combined, not multiple
  values within one field.

## 17. Step 9C Boundary

Milestones is an explicit, honest "coming soon" panel (`EmptyState`, in `roadmap/page.tsx`) — no
fake chart, no placeholder dots. Per `docs/V2-ROADMAP-ARCHITECTURE.md` §15, its real data sources
(`Release.targetDate`, `Initiative.targetLaunchDate`, `Prototype.approvedAt`) are already
identified and require no schema changes; none of that rendering logic was started here.

## 18. Step 9E Drag/Drop Boundary

No drag interaction exists anywhere in the new Timeline components. `docs/V2-ROADMAP-ARCHITECTURE.md`
§11 already established why: the only data mutation the current model supports is
phase-reassignment (a heavy, all-or-nothing regenerate), not a specific date/Sprint move — and
that mutation already has a UI (`RoadmapBoard`, preserved per §15 above). Timeline-native
drag (moving a block to a specific date) needs its own schema/semantics design pass before 9E,
not a reuse of the Kanban drag handlers on a date axis.

---

## Documentation

`docs/V2-ROADMAP-ARCHITECTURE.md` updated in the sections implementation confirmed or refined
(Time Model, Zoom, Drag/Drop, Health, Responsive Strategy, Component Architecture) — see that
file's inline "Confirmed in Step 9B" notes.
