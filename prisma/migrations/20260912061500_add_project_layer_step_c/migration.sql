-- Step C of the account/workspace -> Project -> Initiative restructure.
-- Must ship in the same deploy as the app-code cutover (API routes +
-- src/lib/projectContext.ts's resolveInitiativeEconomics()) that stops
-- reading Initiative.budget/averageHourlyRate/targetLaunchDate directly and
-- starts reading project.<field> ?? initiative.<field>Override instead.
--
-- Safe to run unconditionally here: step B's backfill
-- (scripts/backfill-project-layer.ts) confirmed 0 Initiative rows had a NULL
-- projectId in this environment (in fact 0 Initiative rows existed at all at
-- backfill time), so there is no data this tightens away.
--
-- Hand-written, same reason as step A (see its migration.sql header) —
-- `prisma migrate dev`/`migrate diff` both fail before reaching this change
-- because of `platform_admins`'s cross-schema FK into `auth.users`.

-- AlterTable
ALTER TABLE "Initiative" ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "Initiative" ADD COLUMN "targetLaunchDateOverride" TIMESTAMP(3);
ALTER TABLE "Initiative" ADD COLUMN "budgetOverride" DOUBLE PRECISION;
ALTER TABLE "Initiative" ADD COLUMN "averageHourlyRateOverride" DOUBLE PRECISION;

ALTER TABLE "Initiative" DROP COLUMN "targetLaunchDate";
ALTER TABLE "Initiative" DROP COLUMN "budget";
ALTER TABLE "Initiative" DROP COLUMN "averageHourlyRate";
