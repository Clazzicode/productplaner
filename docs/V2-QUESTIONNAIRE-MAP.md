# V2 Questionnaire Analysis & Flow Design (Step 5A)

Status: **Step 5A analysis (below) is unchanged — it remains the "why" record, verified against
the pre-5B codebase, file:line citations throughout.** Step 5B has since implemented the proposed
flow in §5. For what was actually built (final field groupings, the legacy-compatibility
mechanism, the methodology-wiring fix, role/experience-guidance implementation, and what's still
deferred), see `docs/V2-QUESTIONNAIRE-IMPLEMENTATION.md` — that document supersedes this one
wherever the two differ on implementation detail; this one remains authoritative for the
*analysis* (what each field does downstream, why each recommendation was made).

---

## 1. Current User Flow

The current end-to-end flow, verified against the code:

```
/welcome (QualifyingWizard, 6 questions)
  ↓ POST /api/qualifying → creates QualifyingProfile
    (blocked entirely — no row created — if productType === "non_product")
/initiatives/new (NewInitiativeForm)
  ↓ POST /api/initiatives → requires an active QualifyingProfile (403 otherwise)
/initiatives/[id]/intake (IntakeWizard, 6 screens)
  Step 0: problemStatement
  Step 1: targetCustomer
  Step 2: outcomeStatement + outcomeMetric
  Step 3: Capabilities loop (CapabilityForm, repeated per capability)
  Step 4: capacity/delivery numbers
  Step 5: Review (GET /api/initiatives/[id]/validate)
  ↓ POST /api/initiatives/[id]/generate
runs validateIntake() → deterministic generation engine (src/lib/generation/engine.ts)
  → roadmap → feature hierarchy → epics → stories → acceptance criteria → sprints → releases
```

Key structural facts:
- Qualification (`/welcome`) and initiative creation (`/initiatives/new`) are **separate screens**
  from the intake wizard — three distinct entry points before generation, not one continuous flow.
- `Initiative.methodology` is displayed as static text ("Hybrid waterfall") on `/initiatives/new`
  and is **not** part of the creation payload at all — `initiativeCreateSchema` has no `methodology`
  field (`src/lib/validation/schemas.ts:23-29`; `src/app/api/initiatives/route.ts:17-30`).
- A `QualifyingProfile` is a hard prerequisite for creating an `Initiative`: `getActiveProfile()` is
  checked in `POST /api/initiatives` and a missing profile 403s before any DB write
  (`src/app/api/initiatives/route.ts:12-15`).

---

## 2. Existing Question Inventory

Every question/input currently collected by a human, in flow order:

**Qualification (`/welcome`, `QualifyingWizard.tsx`):** role, experienceLevel, teamComposition,
productType, executionTool, statedMethodology.

**Initiative creation (`/initiatives/new`, `NewInitiativeForm.tsx`):** name, description,
targetLaunchDate, budget, averageHourlyRate.

**Intake (`/initiatives/[id]/intake`, `IntakeWizard.tsx`):** problemStatement, targetCustomer,
outcomeStatement, outcomeMetric, then per capability: name, description, isMvp, effortSize,
businessValue, riskLevel, mvpImportance (optional override), dependsOn (checkboxes), and an
optional "advanced" toggle exposing customerImpactScore/revenueImpactScore/strategicAlignmentScore/
riskComplianceScore. Then: teamSize, sprintLengthWeeks, hoursPerSprintPerMember,
utilizationRatePercent, capacityBufferPercent, hoursPerStoryPoint, historicalVelocityPoints.

**Schema fields with no UI entry point at all** (found during the audit, listed for completeness):
`Capability.manualPhaseOverride` (workspace Timeline drag-and-drop only, not intake),
`Capability.businessValueScore` (server-computed, never directly entered),
`CapabilityDependency.note` (`schema.prisma:130`, comment says "Q5 free text" — was apparently
intended but was never wired into the UI or into `capabilityUpsertSchema`),
`IntakeAnswerSet.velocityPerPersonPerSprint` (typed in `IntakeView` but has no input control
anywhere and is never sent in the PATCH body — already dead in Prototype 1 today, not a V2 change).

---

## 3. Traceability Matrix

| Question / Input | Current Screen | Storage | Required/Optional | Downstream Consumer | Generation Impact | V2 Recommendation |
|---|---|---|---|---|---|---|
| role | `/welcome` | `QualifyingProfile.role` | Required (enum, no default) | `verbose` flag in `intake/page.tsx:30-33` only | None — zero reads in `src/lib/generation/**` | **Remove** — see §6 |
| experienceLevel | `/welcome` | `QualifyingProfile.experienceLevel` | Required | Same `verbose` flag | None on generation itself, but genuinely changes intake guidance depth | **Move** into new Section 1 (or keep pre-questionnaire) |
| teamComposition | `/welcome` | `QualifyingProfile.teamComposition` | Required | None found anywhere in `src/` | None | **Remove** |
| productType | `/welcome` | `QualifyingProfile.productType` + `isProductWork` | Required | Gates whether a `QualifyingProfile` is created at all (403 for `non_product`) | Blocks the entire flow (by design) | **Move** earlier — see §6 |
| executionTool | `/welcome` | `QualifyingProfile.executionTool` | Required | None — `jiraStub.ts` hardcodes `"jira"` regardless | None today | **Move** to new Section 5 (future integration routing) |
| statedMethodology | `/welcome` | `QualifyingProfile.statedMethodology` | Required | **None** — never copied to `Initiative.methodology` | None today (latent bug — see §9) | **Move** to Section 5 + fix the wiring (§9) |
| Initiative name | `/initiatives/new` | `Initiative.name` | Required (min 3) | Display/identification everywhere | None on plan content | **Combine** into Section 1 |
| Initiative description | `/initiatives/new` | `Initiative.description` | Optional | Display only | None | **Combine** into Section 1 |
| targetLaunchDate | `/initiatives/new` | `Initiative.targetLaunchDate` | Optional | Cost/health "days remaining" style calcs | Affects health/cost display, not structure | **Combine** into Section 2 |
| budget | `/initiatives/new` | `Initiative.budget` | Optional | `costHealth`/`budgetVariance` (null-safe if absent) | Cost variance display only | **Combine** into Section 2 |
| averageHourlyRate | `/initiatives/new` | `Initiative.averageHourlyRate` | Optional (defaults 85) | `computeSprintLaborCost`/`buildCostModel` | Cost totals | **Move** into Section 4 advanced (it's a cost assumption, not identity) |
| problemStatement | Intake step 0 | `IntakeAnswerSet.problemStatement` | **Required** (≥15 chars, `validateIntake.ts:34-40`) | Interpolated into story/AC text; hard generation gate | Blocks generation if too short | **Keep** — Section 1 |
| targetCustomer | Intake step 1 | `IntakeAnswerSet.targetCustomer` | **Required** (≥5 chars) | Persona text in stories/ACs; hard gate | Blocks generation | **Keep** — Section 1 |
| outcomeStatement | Intake step 2 | `IntakeAnswerSet.outcomeStatement` | **Required** (≥10 chars) | Benefit text in stories/ACs; hard gate | Blocks generation | **Keep** — Section 2 |
| outcomeMetric | Intake step 2 | `IntakeAnswerSet.outcomeMetric` | Optional | Warning only if empty | None structural | **Keep** — Section 2 |
| Capability name/description | Intake step 3 | `Capability.name`/`description` | name required (min 3) | Feature title/body in decomposition | Structural — one PlannedFeature per capability | **Keep** — Section 3 |
| isMvp | Intake step 3 | `Capability.isMvp` | **Required** | Phase assignment (Phase 1 gate); `deriveMvpImportance`; hard gate (≥1 MVP required, no MVP-depends-on-non-MVP) | Structural — phase & priority | **Keep** — Section 3 |
| effortSize | Intake step 3 | `Capability.effortSize` | **Required** | `EPIC_TEMPLATE` → epic count & stories-per-epic; story point sizing | Structural — story/epic count | **Keep** — Section 3 |
| businessValue | Intake step 3 | `Capability.businessValue` | **Required** | `VALUE_SCORE` fallback for priority; Phase 2 gate ("high"/"critical") | Ordering + phase | **Keep** — Section 3 |
| riskLevel | Intake step 3 | `Capability.riskLevel` | Optional (DB default "medium") | `riskReductionScore` (priority ordering only) | Ordering only | **Keep** — Section 3 |
| mvpImportance | Intake step 3 (advanced) | `Capability.mvpImportance` | Optional override | Overrides `deriveMvpImportance` default | Ordering only | **Keep** — Section 3, secondary |
| dependsOn | Intake step 3 | `CapabilityDependency` rows | Optional | `dependencyGraph.ts` — cycle detection (hard gate), phase-closure promotion, ordering | Structural — phase promotion + ordering; cycles block generation | **Keep** — Section 3 |
| 4 sub-factor scores | Intake step 3 (advanced toggle) | `Capability.customerImpactScore` etc. | Optional, **all-or-nothing** | `computeBusinessValueScore` (overrides `businessValue` fallback when all 4 present) | Ordering precision only | **Keep** — Section 3, advanced |
| teamSize | Intake step 4 | `IntakeAnswerSet.teamSize` | **Required, no safe default** (nullable in DB but hard gate ≥1) | Capacity math | Blocks generation if 0/missing | **Keep** — Section 4, always visible |
| sprintLengthWeeks | Intake step 4 | `IntakeAnswerSet.sprintLengthWeeks` | Optional (DB default 2) | Sprint dating/cadence | Sprint packing | **Move** to Section 4 advanced |
| hoursPerSprintPerMember | Intake step 4 | `IntakeAnswerSet.hoursPerSprintPerMember` | Optional (DB default 80) | Hours-model capacity calc (triggers hours model when >0) | Capacity forecast | **Move** to Section 4 advanced |
| utilizationRatePercent | Intake step 4 | `IntakeAnswerSet.utilizationRatePercent` | Optional (DB default 70) | Same hours-model trigger | Capacity forecast | **Move** to Section 4 advanced |
| capacityBufferPercent | Intake step 4 | `IntakeAnswerSet.capacityBufferPercent` | Optional (DB default 15) | Multiplies both capacity models; validated 0-90 | Capacity forecast | **Move** to Section 4 advanced |
| hoursPerStoryPoint | Intake step 4 | `IntakeAnswerSet.hoursPerStoryPoint` | Optional (DB default 8) | Hours-model trigger; legacy points↔hours conversion | Capacity/cost forecast | **Move** to Section 4 advanced |
| historicalVelocityPoints | Intake step 4 | `IntakeAnswerSet.historicalVelocityPoints` | Fully optional | Caps capacity estimate if >0 | Capacity forecast (safety rail) | **Move** to Section 4 advanced |
| velocityPerPersonPerSprint | *(no UI control today)* | `IntakeAnswerSet.velocityPerPersonPerSprint` | Optional (DB default 8) | Legacy fallback only when hours-model fields absent | None, given hours-model is always present | **Remove/Defer** — already effectively absent |
| CapabilityDependency.note | *(no UI control today)* | `CapabilityDependency.note` | Optional | None — never read for generation | None | **Defer** — nice-to-have "why" text, optional for Step 5B |

---

## 4. Duplicate / Redundant Questions

- **Role, asked twice with incompatible vocabularies.** Qualification's `role`
  (senior_pm/product_owner/business_analyst/project_manager/scrum_master/founder_first_timer/
  executive_stakeholder — 7 options) vs. V2 onboarding's Working Role
  (product_management/project_manager/developer — 3 options) are two different concepts wearing the
  same name. Qualification's `role` is proven inert beyond one UI text-depth flag (§3), so this is
  pure duplication, not two legitimately different signals. See §6 for the resolution.
- **teamComposition** has zero downstream consumers — not exactly a duplicate of anything, but pure
  unused weight that adds a question for no product benefit.
- **executionTool and statedMethodology** are both currently write-only/inert, but unlike
  `teamComposition` they map onto concepts the user explicitly wants preserved (Section 5 in their
  proposed design) — not redundant in *intent*, just currently disconnected from any effect.
- **Initiative creation vs. intake are split across two separate screens/API calls** for no
  functional reason found in the code — nothing prevents collecting name/description/date/budget in
  the same continuous flow as problem/customer/outcome. This isn't "redundant" in the sense of
  asking the same thing twice, but it is unnecessary flow fragmentation given the user's own
  proposed Section 1/2 design already collapses them.

---

## 5. Proposed V2 Questionnaire

High-level section sequence (matches the user's proposed direction, filled in with the audit above):

```
Section 1 — Product Direction
  productType gate (moved earlier, first question)
  Initiative name, "what are you building" (→ Initiative.description), problemStatement, targetCustomer

Section 2 — Success
  outcomeStatement, outcomeMetric (optional), targetLaunchDate (optional), budget (optional)

Section 3 — Capabilities
  Per-capability: name, description, isMvp, effortSize, businessValue, riskLevel, mvpImportance,
  dependsOn, optional advanced sub-factor scoring — grouped into labeled sub-sections (see §7)

Section 4 — Delivery
  teamSize (always visible)
  Advanced planning assumptions (collapsed, pre-filled, inspectable): sprintLengthWeeks,
  hoursPerSprintPerMember, utilizationRatePercent, hoursPerStoryPoint, capacityBufferPercent,
  averageHourlyRate, historicalVelocityPoints

Section 5 — Execution Preferences
  methodology (now actually wired to Initiative.methodology — see §9), executionTool

Section 6 — Review & Generate
  Summary of every answer + every assumption in use, edit-in-place, then Generate
  (calls the existing, unmodified generation engine)
```

`experienceLevel` (the one qualification field with a real effect) is retained as a lightweight
early question — exact placement (Section 1 vs. a pre-questionnaire micro-question) is a Step 5B UX
call, not a data-modeling one, since nothing downstream depends on where it's asked.

---

## 6. Role-Aware Guidance

Working Role (from onboarding) should drive *language emphasis only* — every role still produces
the same required fields, per the user's explicit constraint.

| Working Role | Emphasize in copy/help text |
|---|---|
| Product Management | Customer, product outcomes, MVP reasoning, business value, roadmap framing |
| Project Manager | Dependencies, delivery sequencing, risk, capacity, timing/milestones |
| Developer | Why each product question matters, capability decomposition, effort sizing, dependency mechanics, delivery assumptions |

**QualifyingProfile.role → V2 Working Role resolution (the decision the user asked for):**
`QualifyingProfile.role` is proven functionally inert except for one thing: combined with
`experienceLevel`, it sets a `verbose` boolean that swaps help-text depth in the intake wizard
(`intake/page.tsx:30-33`). Recommendation:
- **Drop the standalone "role" question from the questionnaire entirely.** Asking it again is pure
  duplication of onboarding's Working Role, for a field nothing in generation reads.
- **Re-derive `verbose` from `experienceLevel` alone** (it already does most of this work —
  first_time/some_experience already triggers verbose regardless of role). This removes the only
  real dependency on `role` without changing generation behavior at all.
- **Do not attempt a Working-Role → `QualifyingProfile.role` mapping.** The existing enum
  (senior_pm/product_owner/business_analyst/project_manager/scrum_master/founder_first_timer/
  executive_stakeholder) has no "developer" value and no clean 1:1 correspondence to the 3 Working
  Roles — any mapping would assign a semantically false label. Instead, write a fixed neutral
  placeholder value into `QualifyingProfile.role` at profile-creation time, purely to satisfy the
  required (non-nullable, no-default) DB column, and treat the field as **vestigial** — a real
  fix (dropping the column or making it nullable) waits until the V2 database is isolated and
  `User.workingRole` exists to replace it for real (per `docs/V2-ARCHITECTURE.md` §11).
- Working Role itself should drive the *guidance emphasis table above*, replacing what `role` used
  to (weakly) inform — a strictly better signal, since it's the one the user actually selects
  purposefully during onboarding rather than picking from a 7-option qualification list.

---

## 7. Progressive Disclosure

**Always visible (no safe default exists):**
- productType gate, problemStatement, targetCustomer, outcomeStatement
- Per capability: name, isMvp, effortSize, businessValue
- teamSize

**Visible but lightweight (optional, cheap, worth asking without hiding):**
- Initiative name, outcomeMetric, targetLaunchDate, budget, experienceLevel
- Per capability: description, riskLevel, dependsOn

**Behind "Advanced planning assumptions" (has a DB default the engine already relies on today):**
- sprintLengthWeeks, hoursPerSprintPerMember, utilizationRatePercent, hoursPerStoryPoint,
  capacityBufferPercent, averageHourlyRate, historicalVelocityPoints

**Behind a per-capability "Advanced scoring" toggle (already the current pattern — keep it):**
- customerImpactScore, revenueImpactScore, strategicAlignmentScore, riskComplianceScore
  (all-or-nothing — the UI must not allow submitting a partial set, since the engine silently
  discards anything less than all 4)

Per the user's explicit requirement, "advanced" must mean *collapsed by default*, not *hidden* —
the Review screen (Section 6) should show every assumption in effect, including untouched advanced
defaults, before Generate.

**Capability sub-form UX recommendation:** keep the current single-card-per-capability pattern
(not a multi-step sub-wizard — repeating a multi-screen wizard for every capability would get
tedious fast for someone entering 8-10 capabilities), but reorganize the ~7 fields into three
visually labeled groups — *Basics* (name, description), *Sizing & Priority* (isMvp, effortSize,
businessValue, riskLevel), *Dependencies* (dependsOn, mvpImportance) — with the 4-sub-factor
scoring behind its existing "advanced" toggle. This is a recommendation for confirmation, not a
locked decision.

---

## 8. Proposed Data Mapping

Every proposed V2 question maps onto an **existing** Prisma field — zero schema changes required
for the redesign itself:

| V2 Question | Maps to |
|---|---|
| productType gate | `QualifyingProfile.productType` / `isProductWork` (unchanged mechanism) |
| Product name | `Initiative.name` |
| What are you building? | `Initiative.description` |
| Problem / customer / outcome | `IntakeAnswerSet.problemStatement` / `targetCustomer` / `outcomeStatement` / `outcomeMetric` |
| Launch date / budget | `Initiative.targetLaunchDate` / `budget` |
| Capabilities section | `Capability` + `CapabilityDependency` (all existing fields, §3) |
| Delivery section | `IntakeAnswerSet` capacity fields (§3) + `Initiative.averageHourlyRate` |
| Methodology | `Initiative.methodology` (existing field — needs the wiring fix, §9) |
| Execution tool | `QualifyingProfile.executionTool` (unchanged storage; currently inert) |
| Working Role | Cookie-only today per `docs/V2-ONBOARDING.md`; future `User.workingRole` per `docs/V2-ARCHITECTURE.md` §10 |

The one deliberate exception is dropping the "role" question (§6) — nothing new needs to be added
to the schema to support that; `QualifyingProfile.role` simply receives a fixed placeholder instead
of a real answer.

---

## 9. Compatibility Risks

- **`statedMethodology` → `Initiative.methodology` silent-discard bug (pre-existing, not caused by
  V2).** If Step 5B asks a methodology question in the new Section 5 without also fixing
  `POST /api/initiatives` to actually copy it onto `Initiative.methodology`, the redesigned
  questionnaire will repeat the exact same lie the current one tells (the qualifying summary screen
  already hardcodes "Hybrid waterfall" regardless of the answer). This is a **small, low-risk fix**
  (the field already exists; only the creation route and `initiativeCreateSchema` need to include
  it) but it does change generation behavior for methodologies other than hybrid, so Step 5B should
  call it out explicitly rather than bundle it silently into a UI-only PR.
- **`QualifyingProfile.role` enum has no "developer" value.** Confirmed no clean mapping exists from
  V2 Working Role — resolved in §6 by not mapping at all, but flagging here since it's the kind of
  thing that looks like a simple lookup table until someone tries to write it.
- **The 4 capability sub-factor scores are all-or-nothing.** `valueFactorsFrom` returns `null`
  unless all 4 are present (`scoring.ts:43-59`) — any redesigned "advanced scoring" UI must submit
  all 4 or none; a partial submission is silently and invisibly discarded by the engine today, which
  would be a confusing bug to reintroduce if the new UI allows partial entry.
- **`velocityPerPersonPerSprint` is validated but not user-editable.** `validateIntake.ts` still
  hard-requires it `> 0` even though no UI writes it — currently harmless only because the DB
  default (8) always satisfies the check. If Step 5B ever adds a "reset to defaults" or bulk-edit
  path that could null this field out, generation would start failing validation for a reason
  invisible in the new UI. Worth a one-line defensive note in Step 5B, not a schema change.
- **Qualification profile is a hard prerequisite for initiative creation** (`getActiveProfile()`
  check, §1). If Step 5B collapses qualification into the same continuous flow as intake, the order
  of operations (profile created → then initiative created) must be preserved even if the screens
  are visually merged, or `POST /api/initiatives` will 403.
- **Capability count/story count is driven entirely by `effortSize`, not by scoring.** Any UI
  copy implying "business value affects how big this gets" would be describing the tool
  incorrectly — value/risk affect *ordering and phase*, not decomposition size. Worth getting the
  in-app copy right in Step 5B to avoid user confusion about what each answer actually does.

---

## 10. Step 5B Implementation Plan

Smallest logical sequence, each step independently shippable/testable:

1. **Fix the methodology wiring** (`POST /api/initiatives` + `initiativeCreateSchema`) — small,
   isolated, testable against the existing 67 tests plus a new one; unblocks Section 5 being honest.
2. **Combine initiative-creation fields + the productType gate into a new Section 1/2 screen**,
   replacing the separate `/initiatives/new` pre-step. Keep `POST /api/qualifying` and
   `POST /api/initiatives` as the same two underlying calls, just triggered from one continuous UI.
3. **Drop the "role" question; re-derive `verbose` from `experienceLevel` alone**; write the fixed
   placeholder into `QualifyingProfile.role` at profile creation.
4. **Rebuild the capability step** with the three labeled groups (§7), same fields, same schema.
5. **Rebuild the capacity step** with the basic/advanced split (§7) — `teamSize` always visible,
   the rest collapsed-but-inspectable with current defaults pre-filled.
6. **Build the Section 5 (Execution Preferences) screen** — methodology (now real) + executionTool.
7. **Build the Review & Generate screen** — summary of every answer and every in-effect assumption,
   edit-in-place links back to each section, then the existing unmodified `POST .../generate`.
8. **Role-aware copy pass** — swap in the Working-Role-driven guidance emphasis (§6) once the
   sections above exist to carry it.

Each step touches UI/API glue only — the generation engine, Prisma schema, and validation logic
(`validateIntake.ts`, `scoring.ts`, `decompose.ts`, etc.) are untouched throughout.
