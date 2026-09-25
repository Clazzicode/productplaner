# V2 Roadmap Architecture — Step 9A Audit & Design

Analysis and design only. No application code, Prisma schema, migrations, or generation logic
were changed to produce this document. See **Verification** at the end.

Goal: redesign the single-view Roadmap workspace page into one Roadmap page with three lenses —
**Timeline** (primary/default), **Milestones** (strategic), **Connections** (relationship) — over
the same authorized planning data, without duplicating data or inventing fields the schema
doesn't have.

---

## 1. Current Roadmap Audit

**Route**: `/initiatives/[initiativeId]/workspace/roadmap`
(`src/app/initiatives/[initiativeId]/workspace/roadmap/page.tsx`), inside the shared
`workspace/layout.tsx` that every workspace sub-page (roadmap/features/epics/sprints/capacity/
executive) renders under.

**Components**:

| Component | What it actually is |
|---|---|
| `RoadmapViewToggle.tsx` | Client component toggling between two server-rendered React nodes: `list` and `timeline`. This is the existing view-switcher precedent — the new 3-way Timeline/Milestones/Connections switcher should follow the same "parent fetches once, passes rendered nodes down" shape, not turn the whole page into a client component. |
| List view (inline in `page.tsx`) | Stacked phase sections. Each phase: `EditableArtifact` title/body, computed cost chip, `format(start)→format(end)` date chip (from `roadmap_phase.contentJson`), `TraceBadge`, and a flat wrap of feature chip-links to Feature Hierarchy. |
| `RoadmapBoard.tsx` (rendered as the "timeline" tab today) | **Not a time-axis timeline.** It's a 3-column Kanban board, one column per Phase 1/2/3. Feature cards (native HTML5 drag) move between phase columns via `POST /api/capabilities/[capId]/move-phase`. Epic sub-tiles are nested, read-only, non-draggable. Shows MVP/value/risk badges + cost per feature. This naming collision — today's "Timeline" is a Kanban board — is the single biggest expectation gap for 9B. |
| `RoadmapSnapshot.tsx` (global dashboard) | Compact card: initiative name, `scheduleHealth` badge, current phase name, completion %, next milestone (Release). A lens over the same data, not a copy. |
| `RoadmapTimeline.tsx` (initiative dashboard) | Summary-only 3-column phase grid on the initiative's own dashboard (separate from the workspace roadmap page), read-only, no drag. |

**Data loader**: `RoadmapPage` queries `db.artifactLayer` for `type: "roadmap"` (root) and
`type: "roadmap_phase"` (ordered children, each including `feature` children, each including
`epic` children with a story `_count`). One query tree, no separate "roadmap service."

**Hierarchy** (single self-referential `ArtifactLayer` table, discriminated by `type`):

```
Prototype
 └─ ArtifactLayer(type=roadmap)              — 1 root
     └─ ArtifactLayer(type=roadmap_phase)    — 1..3 (MVP-gated methodologies) or windowed (agile)
         └─ ArtifactLayer(type=feature)      — 1:1 with a Capability (sourceCapabilityId)
             └─ ArtifactLayer(type=epic)
                 └─ ArtifactLayer(type=story)                — points, sprintId
                     └─ ArtifactLayer(type=acceptance_criterion)
```

**Visual structure**: List = stacked cards. Board = fixed 3-column Kanban. Neither has a
horizontal date axis or duration-proportional blocks.

**Timeline/date logic**: `roadmap_phase.contentJson.{startDate,endDate}` are real ISO dates,
computed once at generation (`generatePrototype`) and recomputed on every regen/repack
(`regenerateBelow`, `repackSprints`) — never fabricated, never stale relative to the current
Sprint plan. See **Time Model** (§4) for exactly how.

**Filtering**: none exists today — no filter UI anywhere on the roadmap page.

**Editing**: inline title/body edit via `EditableArtifact` (lock-aware); phase reassignment via
Board drag only.

**Dependency data**: `CapabilityDependency` (real relational edges, `fromCapabilityId` →
`toCapabilityId`, unique pair, optional free-text `note`). **Not visualized on the roadmap page
today at all** — only surfaced as a text list in `ExecutiveReport.tsx` ("Key dependencies") and as
`dependsOnNames` in the dashboard's `RoadmapTimeline.tsx`. `RoadmapBoard.tsx` shows no dependency
information whatsoever.

**Drag/drop**: exists today, and is well-built. `RoadmapBoard.tsx` + `POST
/api/capabilities/[capId]/move-phase` — see full breakdown in §11.

**Lock/baseline**: `LayerLock` (one row per `Prototype` per `LayerType`, sequenced,
`unlocked`/`locked`). Roadmap is layer 1 of 5, gates strict-sequence unless methodology is
`agile_scrum`. Re-locking a previously-locked layer triggers a full regenerate-below. Locking the
last layer (`acceptance_criteria`) snapshots `Prototype.approvedBaselineJson`/`approvedAt` — the
FR-13 baseline. Full detail in §12.

**Generation dependencies**: The roadmap page is a **read-only reflection** of the last
`generatePrototype()` / `regenerateBelow()` / `repackSprints()` run. There is no independent
roadmap-only mutation path except the phase-drag, which itself triggers a downstream regenerate.

### What to preserve

- The `ArtifactLayer`/`Capability`/`Sprint`/`Release`/`CapabilityDependency`/`LayerLock` schema —
  it already supports far more than the current UI surfaces (see §2).
- `partitionPhases` / `orderByDependencyAndPriority` (pure, tested, dependency-aware ordering).
- The `move-phase` mutation's semantics and its cascade/warning reporting (§11) — this is the
  correct model for "what does moving a roadmap item mean," it just isn't wired to a time-axis UI.
- `requireInitiativeView` (page-level, in `workspace/layout.tsx`) / `requireInitiativeApiAccess`
  (route-level) access pattern — already covers the roadmap page with zero roadmap-specific code.
- `LayerLock` / `assertArtifactEditable` gating.
- `loadWorkspace` / `loadCostContext` data loaders (`src/lib/workspace.ts`).
- `health.ts` threshold functions and the already-provisioned 4-tier `health-*` Badge tokens
  (§14 — this is a significant, ready-to-use finding).
- `TraceBadge` / `EditableArtifact` for provenance and inline editing.
- Methodology branching via `profileFor()` (`roadmapMode`, `lockGating`, `sprintMode`,
  `agileLayerGate`) — Timeline must respect the same `continuous_backlog` exclusion the Board
  already enforces for Agile/Scrum.

### What to replace

- `RoadmapBoard.tsx` as "the Timeline" — keep the component and its drag interaction exactly
  where it is (it's the only working phase-mutation surface), but the new **Timeline view** is a
  different visual artifact (time-axis blocks, not fixed Kanban columns) and needs new components
  (§22).
- `RoadmapViewToggle.tsx` — 2-way toggle becomes a 3-way switcher.
- The List view's ad hoc phase-card layout — superseded by Timeline, but its cost-chip /
  date-chip / `TraceBadge` patterns are worth carrying into the new block/detail-panel content.

---

## 2. Existing Data Map

Classified per the fields requested. **Existing** = a real column/relation read today.
**Derivable** = computable at read time from existing data, no schema change. **Missing** = would
require a new model, column, or migration.

| Field | Status | Source / notes |
|---|---|---|
| Initiative | Existing | `Initiative` — container, not itself a roadmap item. |
| Capability | Existing | `Capability` — the real intake work unit: `isMvp`, `effortSize`, `businessValue`, `riskLevel`, `mvpImportance`, `manualPhaseOverride`, dependency edges, priority sub-scores. |
| Feature | Existing | `ArtifactLayer{type:"feature"}`, 1:1 generated from a `Capability` via `sourceCapabilityId`. |
| Epic | Existing | `ArtifactLayer{type:"epic"}`, child of a Feature. |
| Story | Existing | `ArtifactLayer{type:"story"}`, has `points` and `sprintId`. |
| ArtifactLayer | Existing | The generic polymorphic tree underlying roadmap/roadmap_phase/feature/epic/story/acceptance_criterion. |
| Sprint | Existing | Real `startDate`/`endDate`/`capacityPoints`/`releaseId`. Absent entirely for Kanban (`continuous_flow` never creates `Sprint` rows). |
| Release | Existing | Real single `targetDate` (a date, not a range) + `phaseNumber` + `order`. |
| dependencies | Existing | `CapabilityDependency` — directional, capability-scoped, with an optional note. **No** epic/story-level dependency modeling exists. |
| target dates | Existing (Release, Initiative) | `Release.targetDate` (per phase); `Initiative.targetLaunchDate` (optional, initiative-wide, already feeds the admin/global dashboard "approaching launch" widget). Missing at Feature granularity as a stored field — see Derivable below. |
| start/end dates | Existing (Sprint, Phase) / Derivable (Feature) | Sprint dates are real. Phase dates are pre-computed and cached in `roadmap_phase.contentJson`. **Feature-level start/end is Derivable, not stored** — see §4. |
| phase | Existing | `roadmap_phase` ArtifactLayer + `phaseNumber` denormalized onto Sprint/Release/feature `contentJson`. |
| MVP flag | Existing (via join) | `Capability.isMvp`. Not duplicated onto the Feature row itself — the roadmap page already reads it by joining `feature.sourceCapabilityId` → `capViewById`. Treat as Existing, not Missing. |
| status | **Missing** | No per-item execution status (e.g. not-started/in-progress/done) exists anywhere on `Capability` or `ArtifactLayer`. This is a planning tool, not a tracker — the only "status" concepts that exist are `Initiative.status` (draft/intake_in_progress/generated), `Prototype.status`, and per-row `externalRef` (whether it's been pushed to an execution tool). Do not fabricate a status field. |
| health | Existing (Initiative, Release) / Derivable (Feature) | `scheduleHealth`/`costHealth`/`scopeHealth` in `health.ts` are computed today only at Initiative and Release granularity. Feature-granularity health is Derivable by scoping the same formula — see §14. |
| team | **Missing** | `Team`/`TeamMember` exist (Step 8B) and a `Team` can hold `InitiativeAccess` to a whole initiative, but nothing associates a Team with a specific Capability/Feature. No schema path to "group Timeline by Team" without a migration. |
| owner | **Missing** | No `ownerId`/`assigneeId` on `Capability` or `ArtifactLayer`. `Initiative.userId` is the initiative's creator, not a per-item owner. `globalDashboardData.ts` already documents this gap in its own comment ("`ArtifactLayer` has no `assigneeId`"). |
| methodology | Existing | `Initiative.methodology`, resolved via `profileFor()` into `roadmapMode`/`lockGating`/`sprintMode`/`agileLayerGate`. |
| locks/baseline | Existing | `LayerLock` + `Prototype.approvedBaselineJson`/`approvedAt`. |
| integration metadata | Existing (partial) | `ArtifactLayer.externalRef` marks individual **epic/story** rows as synced. `IntegrationProvider.category === "roadmap"` exists and `runDemoSync` already counts `roadmap_phase`+`feature` rows for that category, but does **not** stamp `externalRef` onto feature rows the way it does epic/story — an inconsistency worth noting for §19, not a blocker. |

---

## 3. Roadmap Item Recommendation

**Feature (1:1 with Capability) should drive Timeline blocks.**

Reasoning, weighed against the alternatives:

- **Feature vs. Capability**: A raw `Capability` has no schedule until generation runs — `Sprint`
  rows come from its decomposed Stories, not from the capability itself. `Feature` is the
  generated, schedulable manifestation of a Capability, one-for-one, and already carries
  `sourceCapabilityId` back to it. Using Feature as the block, joined to `Capability` for
  descriptive metadata (`isMvp`, `businessValue`, `riskLevel`, dependency edges), gets both the
  schedule and the metadata without duplicating either.
- **Feature vs. Epic**: Epic is too granular. An XL capability decomposes into up to 3 epics ×
  3–4 stories each — rendering at epic granularity reproduces exactly the over-dense scanning
  problem the product direction explicitly warns against ("should NOT display every Story").
  Epics also carry no independent dependency data — `CapabilityDependency` is capability-scoped
  only — and don't drive phase placement (phase membership lives on the Capability/Feature).
- **Feature vs. Story**: Explicitly ruled out by the product direction. Confirmed correct by the
  audit: Stories are the only layer with sprint-level granularity, which is the right level for
  Sprints & Releases workspace, not for a scanning roadmap.
- **Readability**: Feature count per initiative is bounded by capability count, which the
  intake's own guidance (`DEFAULT_ASSUMPTIONS.recommendedCapabilitiesMax: 8`) keeps small —
  well-suited to a horizontally-scannable block-per-row Timeline.
- **Drill-down**: Feature → Epics → Stories is already the exact tree the roadmap page's own
  query fetches today (`children: { where: { type: "epic" }, include: { children: ... } }`) — the
  detail panel needs no new query shape.

This confirms the product direction's proposed model (Capability/Feature → block, click → detail
panel → linked Epics/Stories) is correct as audited, not merely assumed.

---

## 4. Time Model

**Timeline can operate today with zero schema changes.** Every value below is either already
persisted or a pure read-time aggregation over already-persisted rows.

- **Phase-level start/end**: already computed and cached in `roadmap_phase.contentJson`
  (`startDate`/`endDate`, ISO strings) — recomputed on every generate/regenerate/repack. Usable
  immediately for a phase-grouped Timeline with no new computation.
- **Feature-level start/end** (Derivable): `MIN(startDate)` / `MAX(endDate)` across the `Sprint`
  rows referenced (via `sprintId`) by that Feature's descendant Stories (`sourceCapabilityId`
  matches the Feature's capability). This gives each block a real, distinct duration instead of
  every Feature in a phase sharing identical phase-wide dates.
  - **Exception — Kanban** (`sprintMode: "continuous_flow"`): no `Sprint` rows exist at all
    (`repackSprints` never creates them; every story's `sprintId` stays null). Fall back to the
    phase-level `flow.phaseDateRanges` for every Feature in that phase — coarser, but real, never
    fabricated.
  - **Exception — Agile/Scrum** (`roadmapMode: "continuous_backlog"`): Timeline is not applicable
    at all, matching the existing Board's own rule ("Timeline board isn't available for
    Agile/Scrum — its phases are a continuously re-ranked backlog, not fixed categories").
- **Release relationship**: `Release.targetDate`/`phaseNumber` is 1:1 with a phase; a Feature's
  Release is reached via its phase membership.
- **Duration**: `endDate - startDate` computed at read time, not stored.

> **Confirmed in Step 9B** (`docs/V2-ROADMAP-TIMELINE.md` §4): built exactly as designed, zero
> schema changes. Verified against real generated data in the browser — single-Sprint Features,
> multi-Sprint Features (earliest start / latest end), the Kanban phase-range fallback, and a
> genuinely unscheduled Feature all derive correctly. See
> `src/lib/roadmap/timelineDerivation.ts` (`deriveFeatureSchedule`) and
> `src/lib/roadmap/loadRoadmapTimelineData.ts`.

---

## 5. Timeline Structure

Recommended layout: **left frozen column = Feature name, grouped by Phase; top = time axis;
canvas = horizontal blocks.**

**Default grouping: Phase.** Reasons: it's the hierarchy that already exists (zero new joins),
it matches the mental model the existing Board already trained users on (Phase 1/2/3 columns →
Phase 1/2/3 row-groups), and every other candidate grouping is either Missing data (**Team** — no
schema link, see §2) or out of scope for a single-initiative page (**Initiative** — only matters
once a portfolio/multi-initiative roadmap exists, which this step doesn't build).

Recommend deferring Team and Initiative grouping until their underlying data exists; note
**Capability priority/value** as a plausible additional grouping mode for later (all its inputs —
`businessValue`, priority score — already exist), but not required for 9B.

---

## 6. Zoom

Recommend **Quarter and Year** as the two 9B zoom levels — matches the one-year-roadmap visual
reference directly and avoids building a calendar engine. **Month/day-level zoom is explicitly
deferred**; nothing in the current data model (phase-level date ranges, sprint-level date ranges)
requires day-precision rendering to be useful at MVP.

> **Confirmed in Step 9B**, with one refinement (`docs/V2-ROADMAP-TIMELINE.md` §6): zoom changes
> pixel density only (Year 9px/day, Quarter 20px/day) — both always render the Timeline's full
> scheduled range, never a windowed 3-month slice. Horizontal scroll (§7) is how a user moves
> through the full range at either density; there is no quarter-to-quarter navigation control,
> which would have added real scope this step didn't ask for.

---

## 7. Horizontal Scroll

Recommend: sticky left column (Phase group headers + Feature names) + sticky top time header
(quarter/year ticks) + one horizontally-scrolling canvas beneath both. Vertical alignment should
be guaranteed structurally — render the left column and the canvas rows from the same underlying
array in the same component, not as two independently-scrolled lists that could drift. Responsive
behavior narrows the same structure on laptop/tablet; mobile replaces it entirely (§20). Not
implemented in this phase, per instructions.

---

## 8. Roadmap Block Content

**On the block** (all Existing or Derivable, nothing fabricated): Feature title, MVP marker
(reuse `Badge variant="indigo"` exactly as `RoadmapBoard` already renders it), health treatment
as an edge/strip color (§14) — never a full-block fill. Epic/story count as a small numeral is
optional and should drop first under density pressure (tablet, §20).

**Deliberately NOT on the block**: owner/team/status — all Missing data (§2); do not render
placeholders that imply data that doesn't exist. Cost is real but recommended for the detail panel
only, matching the instruction not to overload blocks — it's already secondary information even
in today's Board (`RoadmapBoard` shows it as a small trailing figure, not the card's focus).

---

## 9. Detail Panel

Recommended fields, every one sourced to Existing or Derivable data, with Missing fields called
out rather than faked:

- Title, description/body — Existing (`feature.title`/`feature.body`).
- Health — Derivable (§14).
- Timing (start/end, phase, release) — Existing/Derivable (§4).
- MVP status, business value, risk level — Existing, via the capability join already computed in
  `capViewById`.
- Owner/team — **Missing.** Show as "Unassigned"/omit the row entirely rather than fabricating a
  value; this is an honest gap, matching how `globalDashboardData.ts` already handles "My Work"
  having no assignee data.
- Dependencies — Existing (`CapabilityDependency`, already computed as `dependsOnNames`).
- Linked Epics/Stories — Existing, same shape the roadmap page's query already fetches.
- Release — Existing.
- Source/integration status — Existing (partial): presence of `externalRef` on any descendant
  epic/story, or the initiative's `IntegrationConnection` status for a relevant provider.

Not built in this phase, per instructions.

---

## 10. Filters

MVP filter set, backed only by real fields: **MVP flag, Business value, Risk level, Phase** — all
Existing on `Capability`, already surfaced in `capViewById`.

**Deferred**: Team, Owner, Status (all Missing data — §2). **Release** is technically Derivable
(1:1 with phase) but adds little as a separate filter when a prototype typically has ≤3
phases/releases — folding it into the Phase filter is sufficient for MVP.

---

## 11. Drag and Drop

**What moving a block means in the current data model, precisely**: dragging a Feature to a
different phase reassigns its underlying `Capability.manualPhaseOverride`, which:

1. Persists the override on `Capability` (committed immediately, outside the main transaction, so
   the next read sees it).
2. Recomputes phase membership for **every** capability via the pure `partitionPhases()` function
   — the dependency-promotion loop can cascade other, undragged capabilities into different
   phases too (reported back as `cascadedMoves`).
3. Rewrites every `roadmap_phase.contentJson` membership list (creating a phase row if the target
   phase didn't exist yet).
4. Calls `regenerateBelow(prototypeId, "roadmap")` — a **full delete-and-recreate** of every
   Feature/Epic/Story/Acceptance-Criterion beneath the roadmap layer, plus a full Sprint repack.
5. Surfaces warnings: MVP capability landing outside Phase 1, or the capability landing in a
   different phase than requested because dependency ordering forced it there.

This is a **structurally heavy, all-or-nothing mutation** — "which of ≤3 phases" — not a
lightweight date nudge. The data model has **no notion of moving a Feature to an arbitrary date
within a phase, or resizing its duration independently**; the only assignable unit is phase
membership.

**Recommendation**: given that mismatch, **9B ships Timeline read-only** — view, filter, zoom,
click-for-detail. Do **not** port drag/drop into the new Timeline surface in 9B. The existing
`RoadmapBoard` stays exactly where it is as the sole drag-capable surface (unchanged) until 9E.

Genuine timeline-native drag (dragging a block to a specific date/sprint) is a materially
different mutation than phase-reassignment — it would mean moving individual Stories to a
different Sprint, or introducing a new per-Feature date-override field, which is a real schema
question this audit deliberately does not answer. Per instructions, this belongs in **9E**, and
even then should start as: **visual move preview → confirmation → an explicit, already-supported
mutation** (reuse the existing move-phase endpoint when the drop lands in a different phase; a
new, narrowly-scoped date/sprint-reassignment endpoint would need its own design pass otherwise).
Never a UI-only position change with no backing mutation.

> **Confirmed in Step 9B**: Timeline shipped fully read-only, exactly as recommended — no drag
> handlers anywhere in the new component tree. `RoadmapBoard` is unchanged and still the only
> drag-capable surface, reachable via a small "Editing tools" row below the primary switcher
> (`docs/V2-ROADMAP-TIMELINE.md` §15). The 9E schema question (per-Feature date override vs.
> Sprint-reassignment) remains open.

---

## 12. Locking / Baseline

`LayerLock{layerType:"roadmap"}` governs Feature/`roadmap_phase` editability via
`assertArtifactEditable()` — the existing move-phase route already checks this and returns 409
when locked. **Timeline must reuse this exact check for any future write path**, never a parallel
lock check.

Two distinct gates apply, and Timeline's read surface should be able to explain both:

- **Roadmap-layer lock** (`LayerLock`): blocks any roadmap-level mutation outright, regardless of
  methodology.
- **Baseline-approved freeze** (Waterfall only, `agileLayerGate: "locked_after_baseline"`): once
  `Prototype.approvedAt` is set, Sprints/Releases freeze too — so even an unlocked roadmap layer's
  Feature dates may be derived from Sprint spans that can no longer change. A Waterfall Timeline
  showing "unlocked" without surfacing this would be misleading.

No lock semantics are bypassed or reinterpreted by this design — Timeline is a read lens over the
same lock state, never a second source of truth for it.

---

## 13. Dependencies

Real data: `CapabilityDependency` — directional, capability/feature-scoped, with an optional note.
No epic/story-level dependency data exists.

**Recommended Timeline MVP representation**: a small dependency-count indicator/icon on the
block, expanding to the existing `dependsOnNames` list (already computed in `workspace.ts`) in
the detail panel or a hover card. **No connector-line rendering in Timeline** — that's explicitly
the Connections view's job (§16), not a bolt-on here; rendering dependency lines across a
time-axis grid is exactly the "visually noisy dependency web" the instructions warn against.

---

## 14. Health

**Reuse `scheduleHealth()`/`costHealth()` verbatim — no second health engine.** Today both are
computed only at Initiative granularity (`globalDashboardData.ts`, `adminDashboardData.ts`,
`ExecutiveReport.tsx`, the capacity page) and at Release granularity
(`globalDashboardData.ts` line ~200). **No code anywhere computes health at Feature/Capability
granularity today.**

**Recommendation (Derivable, not Missing)**: extend `scheduleHealth()` to Feature granularity at
read time only — scope the same points-vs-capacity ratio to a Feature's own story points against
the capacity of the Sprint(s) its stories fall into. No schema or generation-engine change.

**The four-color system is not a new invention — it's already built and waiting.** `Badge.tsx`
and `globals.css` already define four distinct, real CSS tokens exactly matching the requested
language:

| Token | Hex | Requested color |
|---|---|---|
| `health-good` | `#15803d` | Green — healthy |
| `health-attention` | `#a16207` | Yellow — attention |
| `health-warning` | `#c2410c` | Orange — approaching issue |
| `health-critical` | `#b91c1c` | Red — overdue/problem |

`docs/V2-DESIGN-SYSTEM.md` §10 documents `health-warning` as **explicitly reserved and unconsumed
today**, provisioned "for a future 4th health tier the user's instructions explicitly asked for as
a forward-looking system." The current domain `HealthStatus` type only has three values
(`on_track`/`attention`/`at_risk`), so `healthTokenVariant()` today maps only three of the four
tokens.

Recommend Timeline become the **first real consumer of the orange tier**, derived — not stored —
by combining signals already available: e.g. a Feature whose schedule ratio falls in the
"attention" band **and** whose phase end date is within N days, distinguished from a Feature
that's already past its phase end date with an over-ratio (`health-critical`). This is a read-time
classification function, not a new stored field — classify as Derivable.

Apply as a **block-edge color / small strip / dot**, never a full-block fill — matching both the
instruction and the existing Badge convention (`Badge` already renders health as a small pill,
never a background wash).

> **Confirmed in Step 9B**, with the exact split rule now concrete
> (`docs/V2-ROADMAP-TIMELINE.md` §8): base tier reuses `scheduleHealth()`/`computeCapacityForecast()`
> verbatim; the `at_risk` base is split into `warning` (orange) when the Feature's derived end date
> hasn't passed yet, or `critical` (red) when it has. `timelineHealthTokenVariant()` was added to
> `Badge.tsx` (additive) as the first real consumer of `health-warning`. Verified in browser QA —
> all three non-`on_track` tiers rendered distinctly against real (and one deliberately
> manufactured) over-capacity Sprint data.

---

## 15. Milestones View Data

Legitimate MVP milestones — all Existing, nothing fabricated:

- **`Release`** rows (`name` + `targetDate`, 1–3 per prototype, phase-aligned) — the primary
  source. Already the basis of "next milestone" on `RoadmapSnapshot.tsx` today.
- **`Initiative.targetLaunchDate`** — optional, user-set at intake, already surfaced as a
  strategic "launch" checkpoint on the admin and global dashboards
  (`adminDashboardData.ts`/`globalDashboardData.ts` "approaching launch" widgets). Distinct from a
  Release date, so worth its own marker kind.
- **`Prototype.approvedAt`** — the FR-13 baseline-approval timestamp, a real decision-gate event.

**Not legitimate without new schema**: individual `Sprint` boundaries (too operationally granular
for an executive strategic view — that's Timeline's job); per-capability "major completion" dates
(no such field exists).

Recommend 9C plot `Release.targetDate` + `Initiative.targetLaunchDate` + `Prototype.approvedAt` on
one sparse time axis, each labeled by kind, matching the sparse milestone/dot visual reference.

---

## 16. Connections View Data

Real relationships: **`CapabilityDependency`** only — directional edges between Features (via
their 1:1 Capability), with an optional note. This is the sole genuine cross-item relationship
that exists in the schema today.

**Explicitly not real relationships — would be visual inference, not data**:

- "Shared teams" — no Team↔Capability/Feature link exists (§2 Missing).
- "Shared releases" — every capability in the same phase trivially shares that phase's Release;
  graphing this would just re-draw phase membership as if it were a discovered relationship, not
  show anything new.
- "Linked features/epics" — already a parent/child tree, not a peer relationship worth graphing
  again.

**Recommended 9D MVP node/edge types**: nodes = Features (1:1 Capability); edges =
`CapabilityDependency` only. Do not visually cluster by team or release — that would imply
relationships the database doesn't support, which the instructions explicitly disallow.

---

## 17. Authorization

Confirmed: all three views sit under the existing single guard —
`requireInitiativeView(user.id, initiativeId)` in `workspace/layout.tsx` — which already covers
every workspace sub-page including roadmap with **zero roadmap-specific permission code**. Timeline
/ Milestones / Connections need no new permission logic; they are simply three render paths over
the same authorized query result.

Any future write path from within Timeline (a phase-drag equivalent) should call
`requireInitiativeApiAccess(userId, initiativeId, "edit")` exactly as the existing `move-phase`
route does — never a view-specific permission branch. `owner`-level access stays entirely about
access-management (per Step 8C), unrelated to roadmap content itself.

---

## 18. Client / External View Readiness

No existing client-safe/external-view concept was found in the codebase (no matches for
"client-safe," "external view," or "presentation filter" outside `mutations.ts`, which is
unrelated). The existing `memberType: "external"` hard-cap (external users never resolve above
View, `resolution.ts`) is an **access-level** concept, not a **content-redaction** concept — it
should not be conflated with a future "hide sensitive fields from clients" filter.

Recommend Timeline's eventual client-safe mode be a pure rendering-layer filter over the same
query result (e.g. hide cost/health/internal notes, keep title/phase/dates) — never a second
roadmap dataset or a duplicated query path. Not implemented in this phase, per instructions.

---

## 19. Integration Readiness

`ArtifactLayer.externalRef` already marks individual epic/story rows as pushed to an execution
tool. `IntegrationProvider.category === "roadmap"` already exists as a provider category, and
`runDemoSync()` already counts `roadmap_phase` + `feature` rows for that category's sync message —
but does not stamp `externalRef` onto feature rows the way it does epic/story rows (a real gap,
noted, not fixed here).

Recommend a future subtle sync indicator (small icon, block face or detail panel) keyed off
either: (a) whether a Feature's descendant epics/stories carry any `externalRef`, or (b) the
initiative's `IntegrationConnection.status` for a `category: "roadmap"` or `"execution"` provider.
No real synchronization changes made in this phase, per instructions.

---

## 20. Responsive Strategy

- **Desktop**: full 3-view Timeline/Milestones/Connections, all block content from §8.
- **Laptop**: same structure; horizontal canvas scroll engages sooner.
- **Tablet**: horizontal canvas + compact rows — drop epic/story counts from the block face first,
  keep MVP marker + health strip.
- **Mobile**: do **not** compress the timeline grid into unreadable blocks. Recommend falling back
  to a simplified, read-only vertical list — and specifically, **reuse the current List view's
  existing rendering** (`page.tsx`'s stacked phase-card body) as that fallback rather than
  building a new mobile component, since it already works at any width today.

> **Confirmed in Step 9B, with a refinement**: the reuse-the-List-view idea didn't survive contact
> with real data — List has no dates/health/dependencies, which the product direction explicitly
> requires the mobile view to expose. Browser QA at 375px also showed the *grid itself* (not just
> List) needed a hard cutoff: a genuinely new component, `TimelineMobileList.tsx`, replaces the
> grid below the `sm` (640px) breakpoint via pure CSS (`hidden sm:block` / `sm:hidden`), sharing
> the same filtered data and detail drawer. See `docs/V2-ROADMAP-TIMELINE.md` §14/§16.

---

## 21. Performance

Target org scale (~10–50 people) bounds initiative size: intake guidance
(`DEFAULT_ASSUMPTIONS.recommendedCapabilitiesMax: 8`) keeps typical capability/Feature counts
small (realistically well under 30 even unbounded), ≤3 phases, dependency edges sparse. This is
comfortably small enough for **direct DOM rendering with CSS Grid/Flex positioning** — no
virtualization, no canvas/WebGL layer needed for 9B–9D. Revisit only if a future
multi-initiative/portfolio roadmap aggregates across many initiatives at once (explicitly out of
scope here).

---

## 22. Component Architecture

Refined against the actual codebase (not a from-scratch guess):

```
RoadmapPage                    — existing page.tsx, becomes 3-view host instead of 2-view
RoadmapViewSwitcher            — replaces RoadmapViewToggle.tsx, same pattern, 3 options
RoadmapToolbar                 — NEW: houses §10 filters + §6 zoom control (neither exists today)

TimelineView
TimelineHeader                 — sticky quarter/year axis
TimelineRow                    — one Phase group, or one Feature row within it
TimelineBlock                  — NEW: supersedes RoadmapBoard's card rendering for time-axis
                                  display; reuse its Badge/cost-formatting helpers, not its
                                  Kanban-column layout

MilestoneView
MilestonePoint

ConnectionsView
ConnectionNode
ConnectionEdge

RoadmapDetailDrawer            — ONE shared drawer for Timeline blocks, Milestone points, and
                                  Connection nodes alike — not three separate drawers
```

**Carried through unchanged**: `EditableArtifact`, `TraceBadge`, `Badge`/`healthTokenVariant`,
`ProgressBar`, `LockBar`/`RefreshBar` (already in the parent layout), `loadWorkspace`/
`loadCostContext`.

**`RoadmapBoard.tsx` + its `move-phase` route**: kept as-is, unchanged, still reachable — the
only working phase-mutation UI until 9E resolves Timeline-native drag semantics (§11). Whether it
folds into the new Timeline view or stays a separate "Board" affordance is a 9B design decision,
not decided here.

> **Confirmed in Step 9B**, actual component tree built under `src/components/workspace/`:
> `RoadmapToolbar`, `RoadmapViewSwitcher` (replaced `RoadmapViewToggle.tsx`, which was deleted —
> pure presentation, fully superseded), `RoadmapLegacyViews` (new — houses List + Board as
> subordinate "Editing tools", not decided against in 9A), and under `timeline/`:
> `TimelineRoadmap` (the stateful root — zoom/filter/selection), `TimelineTimeHeader`,
> `TimelinePhaseGroup`, `TimelineRow`, `TimelineBlock`, `TimelineMobileList` (new — see §20),
> `RoadmapDetailDrawer`, `RoadmapFilters`, `UnscheduledFeatures`. Data boundary:
> `src/lib/roadmap/{timelineDerivation,timelineScale,timelineFilters}.ts` (pure, unit-tested) +
> `loadRoadmapTimelineData.ts` (the one Prisma-facing loader, per the "Data Service" instruction).
> `RoadmapBoard` folded into a subordinate affordance rather than a peer view, as anticipated.

---

## 23. Step 9B–9E Implementation Plan

The instructions' proposed sequence is **confirmed correct** by this audit, with one refinement
driven by §11's finding:

- **9B — Timeline MVP**: month/quarter+year axis, Feature blocks (duration from §4), horizontal
  scroll, health-strip treatment (§14), MVP marker, Phase grouping (§5), the four real filters
  (§10), click → detail panel (§9). **Read-only** — no drag/drop in 9B; `RoadmapBoard` remains the
  sole drag-capable surface in the interim (§11). Zero schema changes required.
- **9C — Milestones**: `Release.targetDate` + `Initiative.targetLaunchDate` + `Prototype.approvedAt`
  on one sparse axis (§15). Zero schema changes required.
- **9D — Connections**: Feature nodes + `CapabilityDependency` edges only (§16). Zero schema
  changes required.
- **9E — Advanced Interaction**: Timeline-native drag/resize (requires its own design pass — §11
  deliberately does not resolve the schema question of per-Feature date overrides vs.
  Sprint-reassignment), stronger dependency visualization, additional zoom/filter polish.

No re-sequencing is warranted: Milestones and Connections are both zero-schema-change, pure-read
views that reuse Timeline's data-loading patterns once they exist, so building them immediately
after Timeline is the right order. The only real adjustment is scoping 9B down to read/click-only,
which the instructions already anticipated as a possibility ("Do not require advanced drag/drop
immediately if data semantics are unsafe") — confirmed by the audit to be exactly the case here.

---

## Verification

*(As of Step 9A — this phase was documentation-only.)*

- Application code changed: **No**
- Prisma schema changed: **No**
- Migration created: **No**
- Database writes: **No**
- Generation engine changed: **No**
- Prototype 1 code changed: **No**

## Verification (Step 9B)

Timeline was implemented — see `docs/V2-ROADMAP-TIMELINE.md` for full detail and its own
Verification section.

- Application code changed: **Yes** (new Timeline view + supporting components/lib; old
  `RoadmapViewToggle.tsx` removed)
- Prisma schema changed: **No**
- Migration created: **No**
- Generation engine changed: **No**
- Drag/drop added to Timeline: **No** (deferred to 9E, per §11)
