# V2 AI Foundation — Step 10A

A centralized, server-side Anthropic integration and the platform's first real AI action,
`ANALYZE_INTAKE`. Additive only: new Prisma models, new `src/lib/ai/*` modules, one new API
route. Nothing in `src/lib/generation/*` (the deterministic planning engine), the existing
per-user-key document-import feature (`src/lib/intakeImport`), or any existing route/page was
changed. See **Verification** at the end.

---

## 1. Why a separate foundation

Before this, the app's only AI usage was per-user: each user brings their own Anthropic key
(Settings → `User.anthropicApiKeyEncrypted`, `src/lib/security/secretBox.ts`), used solely by
document import during intake (`src/lib/intakeImport/analyzeDocument.ts`). That flow is
unaffected by this section — it keeps using each user's own key for that one feature.

This foundation instead uses a single server-side key, `ANTHROPIC_API_KEY`, read only inside
`src/lib/ai/client.ts`, and only from server-only route handlers/action modules — never sent to
or exposed on the client.

## 2. Central system prompt vs. methodology rules

Two deliberately separate files:

- `src/lib/ai/systemPrompt.ts` — `PLATFORM_SYSTEM_PROMPT`, the assistant's identity: the
  planning-support AI for Product Managers, Product Owners, and Project Managers on this
  platform, advisory only, never a source of deterministic computation.
- `src/lib/ai/methodologyRules.ts` — `GLOBAL_PRODUCT_PLANNING_RULES` (rules every action must
  follow — never state dates/points/capacity/dependency order, never rewrite user-entered
  intake fields) and `METHODOLOGY_AI_GUIDANCE`, keyed by the same `Methodology` union
  `src/lib/generation/types.ts` already defines (`hybrid | agile_scrum | waterfall | kanban`).

Every action's prompt is `PLATFORM_SYSTEM_PROMPT + GLOBAL_PRODUCT_PLANNING_RULES +
METHODOLOGY_AI_GUIDANCE[methodology]`.

## 3. AI capability registry

`AiCapability` (Prisma model) + `src/lib/ai/registry.ts`. One row per `AiActionKey`
(`enabled`, `maxOutputTokens`, `userMonthlyLimit`, `organizationMonthlyLimit`, `description`).
Seeded idempotently on first use (`ensureAiCapabilitiesSeeded()`), mirroring
`src/lib/sync/integrationSeed.ts`'s `ensureProvidersSeeded()` — but with one deliberate
difference: the seed upsert's `update` clause is empty. `IntegrationProvider` re-syncs every
field from code on every cold start because its fields aren't runtime-tunable; `AiCapability`'s
fields are exactly what should be adjustable at runtime (direct DB edit today, an admin route
later) without a redeploy clobbering them.

## 4. Usage tracking

`AiUsageEvent` — one row per finished attempt (never "processing"): `userId`,
`organizationId`, `initiativeId` (nullable, for future non-initiative-scoped actions),
`action`, `success`, `inputTokens`, `outputTokens`, `errorMessage`, `createdAt`.

## 5. Usage limits

`userMonthlyLimit`/`organizationMonthlyLimit` reset on the UTC calendar month
(`src/lib/ai/usage.ts`'s `startOfCurrentMonthUtc`). Checked by counting that month's
`AiUsageEvent` rows for the user/org before allowing a new attempt
(`assertAiActionAllowed`).

## 6. Duplicate-request prevention

`AiRequestLock`, keyed on `scopeKey` (the initiative id for an initiative-scoped action, so two
different users triggering the same initiative's analysis at once are both serialized against
each other — not just double-clicks from one user) + `action`, enforced by a database unique
constraint (correct across concurrent serverless invocations, unlike an in-memory lock). A lock
older than 3 minutes is treated as abandoned and cleared before retry, so a crashed request can
never permanently wedge an initiative's AI action.

## 7. Global kill switch

`AI_ENABLED` env var (`src/lib/ai/client.ts`'s `isAiEnabled()`). Unset or anything but the
literal string `"false"` = enabled. An env var rather than a DB flag so it still works even if
the database is unreachable.

## 8. ANALYZE_INTAKE

`src/lib/ai/actions/analyzeIntake.ts`, called from
`POST /api/initiatives/[id]/analyze-intake`. Reads intake data via
`loadIntakeInput(initiativeId)` — **reused directly from
`src/lib/generation/engine.ts`, read-only** — so the AI sees the exact same intake shape the
deterministic engine does. Returns, and persists to the new `IntakeAiAnalysis` table:

- `summary`
- `assumptions`
- `missingInformation`
- `risks` (`{ description, severity }[]`)
- `recommendedRoadmapPhases` (`{ name, description, relatedCapabilities[] }[]` — qualitative
  only, no date/sprint/point field exists in the shape)
- `rationale`

Validated strictly with `analyzeIntakeResultSchema`
(`src/lib/validation/schemas.ts`) before saving — unlike the lenient, `.catch()`-per-field
`intakeImportDraftSchema` used for the human-reviewed import draft, a failed
`ANALYZE_INTAKE` response is never saved, only logged as a failed `AiUsageEvent`.

**Retries:** confirmed during manual testing against the real API, this model occasionally
(not deterministically) serializes its tool call as legacy text-based function-call XML
instead of real JSON structure while still reporting `stop_reason: "tool_use"` — the request
succeeds but the payload fails validation. `runAnalyzeIntake` retries up to 3 attempts total
before giving up; every attempt (failed or not) gets its own `AiUsageEvent` row, so retries
correctly count against usage limits and cost tracking. Validation itself is never loosened —
each attempt is still parsed strictly, and only a validated response is ever saved.

## 9. Guarantees

- **Never overwrites user-entered information**: `IntakeAiAnalysis` is a new, additive-only
  table. Nothing under `src/lib/ai/**` calls `db.intakeAnswerSet.update`,
  `db.capability.update`, or any generation-engine write function.
- **Never performs deterministic calculation**: the response schema has no field capable of
  expressing a date, sprint number, story-point estimate, or capacity figure, and
  `analyzeIntake.ts` never imports `buildPlan.ts`, `scoring.ts`, `cost.ts`, or
  `dependencyGraph.ts`, nor calls `generatePrototype`/`regenerateBelow`/`repackSprints`/
  `recalculatePlan`.

## Verification

- `src/lib/ai/__tests__/usage.test.ts` — pure limit/scope-key/month-boundary logic.
- `src/lib/ai/__tests__/analyzeIntakeResultSchema.test.ts` — response validation, including
  that a date/sprint/point field smuggled into the model's output never survives parsing.
- Manual: `POST /api/initiatives/<id>/analyze-intake` against a real initiative returns `200`
  with the structured analysis and creates matching `IntakeAiAnalysis`/`AiUsageEvent` rows; a
  concurrent second call returns `409`; `AI_ENABLED=false` returns `503`;
  `AiCapability.enabled=false` returns `403`; a zeroed usage limit returns `429`.
