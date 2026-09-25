// DB-facing planning-weights layer, mirroring src/lib/dashboard/dashboardConfiguration.ts:
// every function here is a thin fetch-then-resolve (or fetch-then-write) wrapper —
// the actual merge rule lives in exactly one place (weightResolution.ts).

import type { Prisma } from "@prisma/client";
import { db, withTransaction } from "@/lib/db";
import { VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";
import { businessValueLevelFromScore, computeBusinessValueScore, valueFactorsFrom } from "@/lib/generation/scoring";
import { WEIGHT_SETS, type WeightFactorDefinition, type WeightSetId } from "./weightRegistry";
import { isValidWeightSet, resolveWeightSet } from "./weightResolution";

export class InvalidWeightSetError extends Error {}

/** The initiative's actual, currently-effective weights for one set —
 * registry defaults unless a valid override exists. */
export async function getEffectiveWeights(initiativeId: string, weightSetId: WeightSetId): Promise<Record<string, number>> {
  const row = await db.planningWeightOverride.findUnique({
    where: { initiativeId_weightSetId: { initiativeId, weightSetId } },
    select: { weightsJson: true },
  });
  return resolveWeightSet(weightSetId, row?.weightsJson ?? null);
}

export interface WeightSetConfigView {
  id: WeightSetId;
  title: string;
  description: string;
  factors: WeightFactorDefinition[];
  weights: Record<string, number>;
  defaults: Record<string, number>;
  /** True when this initiative has an explicit, persisted override — as
   * opposed to falling through to the registry default. */
  isOverridden: boolean;
}

/** Full view of both weight sets for the editor UI, always in registry order. */
export async function getWeightConfigurationView(initiativeId: string): Promise<WeightSetConfigView[]> {
  const rows = await db.planningWeightOverride.findMany({
    where: { initiativeId },
    select: { weightSetId: true, weightsJson: true },
  });
  const overrideJsonById = new Map(rows.map((r) => [r.weightSetId, r.weightsJson]));

  return (Object.keys(WEIGHT_SETS) as WeightSetId[]).map((id) => {
    const def = WEIGHT_SETS[id];
    const overrideJson = overrideJsonById.get(id) ?? null;
    return {
      id,
      title: def.title,
      description: def.description,
      factors: def.factors,
      weights: resolveWeightSet(id, overrideJson),
      defaults: def.defaults,
      isOverridden: overrideJson != null,
    };
  });
}

/**
 * Persists a validated weight set for one initiative. Rejects (throws
 * InvalidWeightSetError) rather than normalizing an incomplete or non-summing
 * set — a saved number must be exactly what was entered, to keep scoring
 * transparent. Sparse write: a submitted set that matches the registry
 * default is cleared rather than stored as a redundant row. Saving
 * "valueFactorWeights" bulk-recomputes this initiative's persisted
 * businessValueScore/businessValue for every capability that uses weighted
 * sub-factor scoring — priority score is never persisted, so it already
 * reflects the new weights on next read.
 */
export async function saveWeightConfiguration(
  initiativeId: string,
  weightSetId: WeightSetId,
  weights: Record<string, unknown>,
): Promise<void> {
  if (!isValidWeightSet(weightSetId, weights)) {
    throw new InvalidWeightSetError(
      `Weights for "${weightSetId}" must include every factor as a number and sum to 1.0.`,
    );
  }
  const defaults = WEIGHT_SETS[weightSetId].defaults;
  const matchesDefault = Object.keys(defaults).every((k) => Math.abs(defaults[k] - weights[k]) < 1e-9);

  await withTransaction(async (tx) => {
    if (matchesDefault) {
      await tx.planningWeightOverride.deleteMany({ where: { initiativeId, weightSetId } });
    } else {
      await tx.planningWeightOverride.upsert({
        where: { initiativeId_weightSetId: { initiativeId, weightSetId } },
        create: { initiativeId, weightSetId, weightsJson: JSON.stringify(weights) },
        update: { weightsJson: JSON.stringify(weights) },
      });
    }
    if (weightSetId === "valueFactorWeights") {
      await recomputeBusinessValueScores(tx, initiativeId, weights as typeof VALUE_FACTOR_WEIGHTS);
    }
  });
}

/** Removes the persisted override, uncovering the registry default again —
 * and, for "valueFactorWeights", bulk-recomputes back to the default. */
export async function resetWeightConfiguration(initiativeId: string, weightSetId: WeightSetId): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.planningWeightOverride.deleteMany({ where: { initiativeId, weightSetId } });
    if (weightSetId === "valueFactorWeights") {
      await recomputeBusinessValueScores(tx, initiativeId, VALUE_FACTOR_WEIGHTS);
    }
  });
}

async function recomputeBusinessValueScores(
  tx: Prisma.TransactionClient,
  initiativeId: string,
  weights: typeof VALUE_FACTOR_WEIGHTS,
): Promise<void> {
  const capabilities = await tx.capability.findMany({
    where: { intakeAnswerSet: { initiativeId } },
    select: {
      id: true,
      customerImpactScore: true,
      revenueImpactScore: true,
      strategicAlignmentScore: true,
      riskComplianceScore: true,
    },
  });
  for (const cap of capabilities) {
    const factors = valueFactorsFrom(cap);
    if (!factors) continue; // only capabilities using weighted sub-factor scoring are affected
    const businessValueScore = computeBusinessValueScore(factors, weights);
    await tx.capability.update({
      where: { id: cap.id },
      data: { businessValueScore, businessValue: businessValueLevelFromScore(businessValueScore) },
    });
  }
}
