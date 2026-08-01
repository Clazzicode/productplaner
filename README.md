# Guided Product Planning Platform — Functional Prototype

A working prototype of the platform specified in `../Week 3 combined v2.pdf`: a
methodology-aware planning system that takes a raw product idea through a guided intake and
generates a **connected, traceable, hybrid-waterfall plan** — roadmap → feature hierarchy →
epics → user stories → acceptance criteria, with a sprint plan, release plan, capacity
forecast, cost forecast, and executive presentation computed beneath, then surfaced on a
dashboard and demo integrations hub.

## Scope of this prototype

**In:** real guided intake (5 qualifying + 8 planning questions, extended with risk/cost/budget
inputs) · deterministic rule-based generation engine, including business-value/risk/priority
scoring and a full cost model (`Images/Planning & Cost Logic.txt`) · strict waterfall layer
locking (FR-12) · edit + automatic downstream propagation on re-lock (FR-11) · approved
baseline snapshot (FR-13) · visible traceability on every artifact (FR-10) · a post-generation
review screen · a persistent left-nav dashboard (`Images/Product platform spec.txt`) · live-computed
capacity/cost forecast and executive presentation (FR-19) · a generic **Integrations Hub**
(`/integrations`, 8 seeded demo providers) alongside the original Jira-only stub · a Demo
Explanation Mode toggle with in-page callouts · **stubbed** tool sync throughout (fake
issue keys / sync logs, zero outbound HTTP).

**Out (later releases per the spec):** real Jira/Aha!/Azure DevOps APIs, delivery-actuals
pull and plan-health monitoring (FR-15–18), the AI Decision Engine re-planning loop, Director
approval, planning history, collaborative intake (FR-22–24), multi-tenant auth (a single
demo user is created automatically).

The generation engine is **rule-based, not LLM-backed** — fully offline, no API key, 100%
deterministic. MVP-flagged capabilities become roadmap Phase 1; effort sizes set epic/story
counts; one capacity formula (hours-based, falling back to the legacy points formula) drives
both the waterfall timeline and the sprint packing (the FR-07 "dual mapping") — and the same
hours convert into every cost figure. Every cost/capacity default is a labeled, user-overridable
prototype assumption (§31), never presented as authoritative.

## Run it

```bash
npm install
npx prisma migrate dev   # applies the schema to your Postgres database (see .env)
npm run dev              # http://localhost:3000
```

Other commands: `npm test` (engine + scoring/cost/health unit tests, Vitest) · `npm run build` ·
`npx prisma studio` (inspect the DB).

## Walkthrough (mirrors the spec's five-step journey, now with a dashboard landing page)

1. **Qualify** — answer the 5 qualifying questions at `/welcome`. Picking "Something else"
   for product type demonstrates the product-only filter (FR-02).
2. **Create initiative** — name it, optionally set a target launch date, budget, and average
   hourly rate (defaults to the $85 prototype assumption).
3. **Intake** — answer Q1–Q3, add 3–4 capabilities (mark some MVP, set risk level and business
   value, add a dependency), set team capacity (Q7: hours per member/sprint, utilization,
   buffer, hours per story point). Try making an MVP capability depend on a non-MVP one —
   validation flags it in plain language and blocks generation (FR-05).
4. **Generate & review** — the review screen summarizes what was generated, which assumptions
   were used (each labeled), and any warnings, before you choose View Dashboard / Review
   Roadmap / Review Assumptions / Return to Intake.
5. **Dashboard** — the new landing page for a generated initiative: plan completion, MVP scope,
   delivery forecast and estimated cost cards; the connected plan-health chain (click any level
   to open its workspace); roadmap timeline; sprint/release status; capacity & cost; decisions
   required; recent activity; upcoming actions; connected tools.
6. **Lock, edit, propagate** — in the planning workspace, try locking Epics first: rejected
   (strict sequence, FR-12). Lock Roadmap → Features → Epics → Stories → Acceptance Criteria;
   the final lock stores the approved baseline (FR-13). Then unlock Epics, rename one, re-lock:
   its stories and acceptance criteria regenerate (with the edit visibly propagated) and the
   sprint plan recomputes (FR-11). Every artifact now also shows its estimated cost and, on
   Features, its risk/priority.
7. **Capacity & Cost** — edit the hourly rate, budget, utilization, or buffer and save; sprints
   and every cost figure recompute live without touching locked layers.
8. **Integrations Hub** (`/integrations`) — search/filter 8 demo providers by category, connect
   one (workspace + project key + field mapping), run a demo sync (fake issue keys, a sync log
   entry), then disconnect. The legacy per-workspace Jira panel still works independently.
9. **Sync & present** — the workspace's "Connect (demo)" + "Sync now" still writes fake
   `DEMO-n` keys onto epics and stories (FR-14, stub). The Executive View regenerates from live
   data on every open, now including a cost forecast section and the required prototype
   disclaimer; "Download / print" uses the browser's print-to-PDF.
10. **Demo Explanation Mode** — toggle it in the top bar; dashed callouts appear next to key
    sections explaining what they mean and why. Off by default, and never shown in print.

## Architecture

- **Next.js 16 (App Router) + TypeScript**, API route handlers as the backend.
- **Prisma 6 + Postgres (Supabase)** (`prisma/schema.prisma`) — enum-like fields stay plain
  strings (not native Postgres enums, by convention) constrained by TS unions + Zod.
- `src/lib/generation/` — the engine:
  - `buildPlan.ts` — pure pipeline: phase partitioning, decomposition, sprint packing.
  - `decompose.ts` — feature → epic → story → acceptance-criteria templates.
  - `dependencyGraph.ts` — cycle detection + dependency-respecting priority order (Kahn),
    extended with the §5 priority-score tie-break when risk/MVP-importance inputs are present.
  - `validateIntake.ts` — FR-05 hard errors / soft warnings.
  - `scoring.ts` — business-value weighting, priority score, Fibonacci point snapping.
  - `cost.ts` — hours-based capacity, sprint labor cost, cost/point, story→epic→release→
    initiative cost rollups, budget variance.
  - `health.ts` — schedule/cost/scope health thresholds.
  - `engine.ts` — persistence: full generation + downstream regenerate-and-replace.
  - `locking.ts` — FR-11/12/13 lock state machine.
- `src/lib/sync/jiraStub.ts` — the original per-workspace demo sync (no network calls).
- `src/lib/sync/integrationStub.ts` / `integrationSeed.ts` — the generic Integrations Hub demo
  engine and provider registry seed (coexists with the Jira stub above).
- `src/components/shell/` — persistent left-nav app shell (`AppShell`, `LeftNav`), rendered
  from the root layout around every route except `/welcome` and the print view.
- `src/components/dashboard/`, `src/components/integrations/`, `src/components/demo/` — the
  dashboard widgets, integrations hub UI, and Demo Explanation Mode toggle/callouts.
- `src/components/ui/` — shared primitives (`Card`, `Badge`, `Modal`, `ProgressBar`) introduced
  for the new surfaces, sourced from the existing color/spacing tokens.
- `src/app/initiatives/[id]/dashboard/`, `.../review/` — the new dashboard and
  generation-review pages.
- `src/app/initiatives/[id]/workspace/` — the prototype UI: roadmap, features,
  epics/stories, sprints/releases, capacity & cost, executive views.
- `src/app/integrations/` — the Integrations Hub page.

**Propagation model:** re-locking a previously locked layer performs a full
regenerate-and-replace of everything beneath it (not an incremental diff). The UI warns
exactly what will be regenerated before you confirm. Cost, priority, and health figures are
always computed on read from current data — never persisted — so editing a rate or budget can
never require "silently" touching a locked layer.
