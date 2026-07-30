# Guided Product Planning Platform — Functional Prototype

A working prototype of the platform specified in `../Week 3 combined v2.pdf`: a
methodology-aware planning system that takes a raw product idea through a guided intake and
generates a **connected, traceable, hybrid-waterfall plan** — roadmap → feature hierarchy →
epics → user stories → acceptance criteria, with a sprint plan, release plan, capacity
forecast and executive presentation computed beneath.

## Scope of this prototype

**In:** real guided intake (5 qualifying + 8 planning questions) · deterministic rule-based
generation engine · strict waterfall layer locking (FR-12) · edit + automatic downstream
propagation on re-lock (FR-11) · approved baseline snapshot (FR-13) · visible traceability on
every artifact (FR-10) · live-computed capacity forecast and executive presentation (FR-19) ·
**stubbed** Jira sync (fake `DEMO-n` keys, zero outbound HTTP).

**Out (later releases per the spec):** real Jira/Aha!/Azure DevOps APIs, delivery-actuals
pull and plan-health monitoring (FR-15–18), the AI Decision Engine re-planning loop, Director
approval, planning history, collaborative intake (FR-22–24), multi-tenant auth (a single
demo user is created automatically).

The generation engine is **rule-based, not LLM-backed** — fully offline, no API key, 100%
deterministic. MVP-flagged capabilities become roadmap Phase 1; effort sizes set epic/story
counts; one capacity formula drives both the waterfall timeline and the sprint packing
(the FR-07 "dual mapping").

## Run it

```bash
npm install
npx prisma migrate dev   # creates prisma/dev.db (SQLite, local file)
npm run dev              # http://localhost:3000
```

Other commands: `npm test` (engine unit tests, Vitest) · `npm run build` · `npx prisma studio`
(inspect the DB).

## Walkthrough (mirrors the spec's five-step journey)

1. **Qualify** — answer the 5 qualifying questions at `/welcome`. Picking "Something else"
   for product type demonstrates the product-only filter (FR-02).
2. **Intake** — create an initiative; answer Q1–Q3, add 3–4 capabilities (mark some MVP, add
   a dependency), set team capacity (Q7). Try making an MVP capability depend on a non-MVP
   one — validation flags it in plain language and blocks generation (FR-05).
3. **Generate** — the full connected chain appears in the planning workspace. Every artifact
   has a ⛓ trace badge linking back to the intake answer that produced it (FR-10).
4. **Lock, edit, propagate** — try locking Epics first: rejected (strict sequence, FR-12).
   Lock Roadmap → Features → Epics → Stories → Acceptance Criteria; the final lock stores the
   approved baseline (FR-13). Then unlock Epics, rename one, re-lock: its stories and
   acceptance criteria regenerate (with the edit visibly propagated) and the sprint plan
   recomputes (FR-11).
5. **Sync & present** — "Connect (demo)" + "Sync now" writes fake `DEMO-n` keys onto epics
   and stories (FR-14, stub). The Executive View regenerates from live data on every open;
   "Download / print" uses the browser's print-to-PDF.

## Architecture

- **Next.js 16 (App Router) + TypeScript**, API route handlers as the backend.
- **Prisma 6 + SQLite** (`prisma/schema.prisma`) — zero-setup local persistence. Enum-like
  fields are strings (SQLite has no enums) constrained by TS unions + Zod.
- `src/lib/generation/` — the engine:
  - `buildPlan.ts` — pure pipeline: phase partitioning, decomposition, sprint packing.
  - `decompose.ts` — feature → epic → story → acceptance-criteria templates.
  - `dependencyGraph.ts` — cycle detection + dependency-respecting priority order (Kahn).
  - `validateIntake.ts` — FR-05 hard errors / soft warnings.
  - `engine.ts` — persistence: full generation + downstream regenerate-and-replace.
  - `locking.ts` — FR-11/12/13 lock state machine.
- `src/lib/sync/jiraStub.ts` — the demo sync (no network calls).
- `src/app/initiatives/[id]/workspace/` — the prototype UI: roadmap, features,
  epics/stories, sprints/releases, capacity, executive views.

**Propagation model:** re-locking a previously locked layer performs a full
regenerate-and-replace of everything beneath it (not an incremental diff). The UI warns
exactly what will be regenerated before you confirm.
