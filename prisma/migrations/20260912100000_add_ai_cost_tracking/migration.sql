-- Usage/cost tiers (directive §28/§29). Purely additive:
-- Organization.aiMonthlyBudgetUsd (nullable override) and
-- AiUsageEvent.estimatedCostUsd (defaults to 0 for historical rows — their
-- cost was never computed, and backfilling a guessed number would be worse
-- than an honest zero).
-- Hand-written, same reason as every migration since add_project_layer_step_a.

ALTER TABLE "Organization" ADD COLUMN "aiMonthlyBudgetUsd" DOUBLE PRECISION;
ALTER TABLE "AiUsageEvent" ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
