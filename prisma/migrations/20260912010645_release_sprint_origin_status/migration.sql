-- Guided-activation restructure: distinguish engine-auto-packed Release/Sprint
-- rows from ones a user explicitly confirmed via the new manual Create
-- Release / Plan Sprint flow (see src/lib/lifecycle/resolveLifecycleState.ts
-- and the origin-aware repackSprints in src/lib/generation/engine.ts).
--
-- Hand-written rather than `prisma migrate dev`-generated: this project's
-- migration history includes hand-written RLS migrations that reference the
-- Supabase `auth` schema (20260910044438_rls_foundation and later), which
-- does not exist on Prisma's disposable shadow database, so `migrate dev`
-- cannot diff past them. Same precedent as PlanningWeightOverride's RLS
-- statements. Apply with `prisma migrate deploy` (no shadow DB involved).
--
-- Purely additive columns on tables that already have RLS enabled with a
-- table-level policy (rls_policies migration) — no new policy needed, the
-- existing `sprint_all`/`release_all` policies already cover every column.

ALTER TABLE "Sprint" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Sprint" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE "Release" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'auto';
