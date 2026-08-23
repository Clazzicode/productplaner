# V2 Guided Questionnaire — Implementation (Step 5B)

Status: **Implemented.** Builds on the analysis and recommendations in
`docs/V2-QUESTIONNAIRE-MAP.md`. This document records what was actually built, exactly how, and
what remains intentionally deferred. The generation engine (`src/lib/generation/**`), Prisma
schema, and all existing validation/scoring logic are unchanged — this phase only changed how
inputs are collected and which existing API routes are actually called.

## Flow

```
/initiatives/new  (Section 1 — Product Direction, bootstrap)
  productType gate (only if no QualifyingProfile exists yet) → rejection screen if "non_product"
  experienceLevel (only if no profile yet)
  Initiative name, description, problemStatement, targetCustomer
  ↓ submits: POST /api/qualifying (if needed) → POST /api/initiatives → PATCH .../intake
/initiatives/[id]/intake  (Sections 2–6, one continuous wizard, opens at Section 2)
  2. Success — outcomeStatement, outcomeMetric, targetLaunchDate, budget
  3. Capabilities — unchanged data model, regrouped UI (Basics / Sizing & Priority / Dependencies)
  4. Delivery — teamSize always visible; everything else behind "Advanced planning assumptions"
  5. Execution Preferences — methodology (real, wired) + executionTool (context only)
  6. Review & Generate — full summary, edit-in-place, existing validate/generate calls
```

Section 1 ("Product Direction") is also reachable as step 0 *within* the same wizard at
`/initiatives/[id]/intake` (via the progress bar or Review's Edit link) for editing after
creation — `name`/`description` PATCH `/api/initiatives/[id]`, `problemStatement`/`targetCustomer`
PATCH `.../intake`, same as at creation time.

**Deliberate route reuse, no rewrite:** both `/initiatives/new` and `/initiatives/[id]/intake`
are the *same* existing routes from Prototype 1 — only their rendered components changed
(`ProductDirectionBootstrap` and `PlanningQuestionnaire` respectively, both under
`src/components/questionnaire/`). All six existing API routes involved
(`/api/qualifying`, `/api/initiatives`, `/api/initiatives/[id]`, `/api/initiatives/[id]/intake`,
`/api/initiatives/[id]/capabilities` + `/api/capabilities/[capId]`,
`/api/initiatives/[id]/methodology`, `/api/initiatives/[id]/validate`,
`/api/initiatives/[id]/generate`) are unchanged and reused as-is. `/welcome`
(the old `QualifyingWizard`) was left in place, untouched, for deep-link safety, but root
(`/`) no longer routes new users through it — first-time users go straight to `/initiatives/new`,
which now handles the productType gate itself.

**Removed as dead code:** `src/components/intake/NewInitiativeForm.tsx` and `IntakeWizard.tsx` —
both fully superseded, zero remaining references anywhere in `src/`.

**Returning-user behavior:** if a `QualifyingProfile` already exists (any subsequent initiative,
not just the first), Section 1 skips the productType gate and experienceLevel entirely — those
aren't re-asked per initiative, matching how `getActiveProfile()` already worked before this phase
(it just needs *a* profile to exist, not a fresh one per initiative).

## Data Mapping

Exactly as proposed in `docs/V2-QUESTIONNAIRE-MAP.md` §8 — every field maps to an existing Prisma
column, zero schema changes:

| Section | Field | Destination |
|---|---|---|
| 1 | productType gate | `QualifyingProfile.productType` (+ `isProductWork`) |
| 1 | experienceLevel | `QualifyingProfile.experienceLevel` |
| 1 | name, description | `Initiative.name`, `Initiative.description` |
| 1 | problem, customer | `IntakeAnswerSet.problemStatement`, `targetCustomer` |
| 2 | outcome, metric | `IntakeAnswerSet.outcomeStatement`, `outcomeMetric` |
| 2 | launch date, budget | `Initiative.targetLaunchDate`, `Initiative.budget` |
| 3 | capabilities | `Capability` + `CapabilityDependency` (unchanged) |
| 4 | team size + advanced assumptions | `IntakeAnswerSet` capacity fields (unchanged) |
| 4 | hourly rate | `Initiative.averageHourlyRate` |
| 5 | methodology | `Initiative.methodology` (now actually wired — see below) |
| 5 | execution tool | **not persisted** — see Compatibility Layer |

## Compatibility Layer

`QualifyingProfile.role`, `teamComposition`, `executionTool`, and `statedMethodology` remain
required, non-nullable Prisma columns (schema changes are out of scope until the V2 database is
isolated — `docs/V2-ARCHITECTURE.md` §11). None of them are asked as their old questions anymore.
Isolated in one file, `src/lib/questionnaire/legacyQualifyingDefaults.ts`:

```ts
export const LEGACY_QUALIFYING_PROFILE_DEFAULTS = {
  role: "product_owner",
  teamComposition: "small_team",
  executionTool: "none",
  statedMethodology: "hybrid",
} as const;
```

These four values are submitted once, at profile-creation time in Section 1, purely to satisfy
the column requirement. **They are never displayed as the user's real selection and never drive
any V2 behavior.** Specifically:
- `role` — superseded by Working Role (V2 onboarding). No mapping was attempted: the old 7-option
  enum has no "developer" equivalent, so any mapping would be a false label. Guidance depth now
  comes from `experienceLevel` alone (`src/lib/questionnaire/roleGuidance.ts::depthFromExperience`),
  not from `role` + `experienceLevel` combined as before.
- `teamComposition` — proven to have zero downstream consumers; dropped from the UI entirely.
- `executionTool` — asked for real in Section 5, but the answer lives only in the questionnaire's
  local component state (shown on Review) and is **not** written back to this column — no update
  endpoint exists for it, and nothing reads this column today regardless.
- `statedMethodology` — asked for real in Section 5, but its authoritative destination is
  `Initiative.methodology` (see Methodology below), not this column.

This file should be deleted (and the columns it papers over reconsidered) once the V2 schema can
change for real.

## Role-Aware Guidance

Two independent dimensions, exactly as directed:

- **Working Role → emphasis.** `src/lib/questionnaire/roleGuidance.ts::guidanceFor(section, role)`
  returns one section-level framing line per (section, role) pair — 18 total (6 sections × 3
  roles), all distinct (asserted by a unit test). Rendered by a shared `GuidanceBanner` component
  at the top of every section. Falls back to Product Management framing if no Working Role cookie
  is set (e.g. it expired or was cleared).
- **Experience Level → depth.** `depthFromExperience(experienceLevel)` — `true` for
  `first_time`/`some_experience` — controls per-field help-text length (short vs. example-bearing),
  reusing the exact verbose/concise text pairs already written for the old `IntakeWizard`.

Both are read once, server-side, in each page (`readOnboardingStateServer()` for Working Role,
`initiative.qualifyingProfile.experienceLevel` for depth) and passed down as props — no client-side
refetching.

## Planning Assumptions

Per `docs/V2-QUESTIONNAIRE-MAP.md` §7: `teamSize` is the only always-visible Delivery field (no
safe default exists). Everything else — sprint length, hours/sprint/member, utilization %,
capacity buffer %, hours/story point, historical velocity, average hourly rate — sits behind a
collapsed "Advanced planning assumptions" toggle, pre-filled from the initiative's actual current
values (not hardcoded display defaults). `velocityPerPersonPerSprint` is not exposed anywhere in
the UI, matching its already-dead status in Prototype 1 — it continues to ride on its DB default.
The Review screen shows the real current values of every assumption (a one-line summary), whether
or not Advanced was ever opened, so nothing is a hidden calculation.

The advanced capability-scoring toggle (4 sub-factors) keeps its existing all-or-nothing
enforcement, now backed by a dedicated helper —
`src/lib/questionnaire/capabilityScoring.ts::isAdvancedScoringComplete` — used to disable Save
until all four are set, and to decide whether to submit the four scores at all (a partial set is
never sent to the API).

## Methodology

**The pre-existing disconnect is fixed.** Prototype 1 asked for `statedMethodology` during
qualification and threw it away (`Initiative.methodology` stayed at its Prisma default). In V2,
Section 5's methodology answer is mapped and sent through the **existing**
`POST /api/initiatives/[id]/methodology` endpoint — no new endpoint, no schema change; the
endpoint already existed and already worked correctly, it just was never called from the intake
flow before.

Mapping (`src/lib/questionnaire/methodologyMapping.ts::mapMethodologyAnswer`, unit tested):

| Answer | Stored as |
|---|---|
| Hybrid | `hybrid` |
| Agile / Scrum | `agile_scrum` |
| Waterfall | `waterfall` |
| Kanban | `kanban` |
| Not sure | `hybrid` (explicitly stated in the UI: *"We'll use Hybrid — our recommended default — until you change it"*) |

**Important safeguard:** the methodology endpoint fully regenerates any already-existing plan on
every call, regardless of whether the value actually changed. The questionnaire only calls it when
the mapped value differs from the initiative's current `methodology` — otherwise revisiting
Section 5 without changing anything would silently trigger a full plan regeneration.

Verified end-to-end against a real (test) initiative, not just unit tests: selecting "Agile /
Scrum" in Section 5 and confirming `Initiative.methodology` read back as `"agile_scrum"` from the
database afterward.

## Deferred

- **Execution tool** is not persisted anywhere durable (Compatibility Layer, above) — waiting on a
  real `Organization`/integration model post-database-isolation, per the existing integration
  priority (Jira, then Azure DevOps) in `docs/V2-ARCHITECTURE.md`.
- **`QualifyingProfile.role`/`teamComposition`** placeholder values wait on the V2 database being
  isolated before the columns themselves can be dropped or made nullable.
- **`User.workingRole`** — Working Role still lives only in the onboarding cookie
  (`docs/V2-ONBOARDING.md`), not a real column; unchanged by this phase.
- **CapabilityDependency.note** (the "why does this depend on that" free-text field) — still has
  no UI, as flagged in `docs/V2-QUESTIONNAIRE-MAP.md` §2; not added in this phase (kept to the
  approved scope).
- **Multiple qualification per user** — the "returning user skips the gate" behavior (see Flow,
  above) means qualification answers are effectively fixed after the first initiative; revisiting
  or changing them isn't supported, matching Prototype 1's actual constraint, not a new limitation.
- **The visual design system** — Step 6, not started. This phase intentionally kept styling
  consistent with the existing app (same Tailwind patterns, no new component library, no CRM shell).
- **One test initiative remains in the shared database**: "V2 Questionnaire Smoke Test — safe to
  delete" (created during this phase's browser verification). It was left in place because the
  application currently has no safe per-initiative delete path — the only existing delete
  capability, `POST /api/account/start-over`, deletes *every* initiative for the current user
  (including the unrelated pre-existing "planning portal" initiative), so it couldn't be used
  without affecting other data. Adding a new delete endpoint solely for this cleanup was
  deliberately declined. The initiative has no generated prototype/roadmap/sprint data (status
  `intake_in_progress`, never generated) and zero capabilities.
