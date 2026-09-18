import { currentAuthUserId, db, withTransaction } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { regenerateBelow, type RegenStats } from "./engine";
import { METHODOLOGY_PROFILES, resolveMethodology } from "./methodology";
import { buildLiveSnapshot, recordApprovedRoadmapVersion } from "./versioning";
import {
  LAYER_FOR_ARTIFACT,
  LAYER_LABELS,
  LAYER_SEQUENCE,
  type ArtifactType,
  type LayerType,
  type Methodology,
} from "./types";

export class LockOrderError extends Error {}
export class LockedLayerError extends Error {}

/**
 * FR-12 pure rule: a waterfall layer can only lock when the layer above it is
 * already locked — UNLESS the methodology's lock gating is "unordered"
 * (Agile/Scrum: no rigid phase-gate ceremony, layers can lock in any order).
 * Returns an error message, or null if the lock is allowed. (Pure so it can
 * be unit-tested without a database.)
 */
export function lockOrderViolation(
  locks: { layerType: string; state: string }[],
  layerType: LayerType,
  methodology: Methodology = "hybrid",
): string | null {
  if (METHODOLOGY_PROFILES[resolveMethodology(methodology)].lockGating === "unordered") {
    return null;
  }
  const idx = LAYER_SEQUENCE.indexOf(layerType);
  if (idx <= 0) return null;
  const prevType = LAYER_SEQUENCE[idx - 1];
  const prev = locks.find((l) => l.layerType === prevType);
  if (prev?.state !== "locked") {
    return `Cannot lock ${LAYER_LABELS[layerType]} until ${LAYER_LABELS[prevType]} is locked — waterfall layers lock in strict sequence.`;
  }
  return null;
}

/**
 * FR-11/FR-12/FR-13. Locking a layer that has been locked before first
 * re-propagates: everything beneath it is regenerated and the sprint plan is
 * recomputed. Locking Acceptance Criteria (the last layer) snapshots the
 * approved plan baseline.
 */
export async function lockLayer(
  prototypeId: string,
  layerType: LayerType,
): Promise<{ regenerated: RegenStats | null }> {
  return withTransaction(() => lockLayerInternal(prototypeId, layerType), { timeout: 120_000 });
}

async function lockLayerInternal(prototypeId: string, layerType: LayerType): Promise<{ regenerated: RegenStats | null }> {
  const actor = await requireLockAuthority(prototypeId);
  const [locks, prototype] = await Promise.all([
    db.layerLock.findMany({ where: { prototypeId } }),
    db.prototype.findUniqueOrThrow({
      where: { id: prototypeId },
      include: { initiative: { select: { methodology: true } } },
    }),
  ]);
  const lock = locks.find((l) => l.layerType === layerType);
  if (!lock) throw new Error(`Unknown layer: ${layerType}`);

  const methodology = resolveMethodology(prototype.initiative.methodology);
  const violation = lockOrderViolation(locks, layerType, methodology);
  if (violation) throw new LockOrderError(violation);

  if (lock.state === "locked") return { regenerated: null };

  let regenerated: RegenStats | null = null;
  if (lock.everLocked) {
    // Re-lock after an unlock: propagate downstream (full regenerate-and-replace).
    regenerated = await regenerateBelow(prototypeId, layerType);
  }

  await db.layerLock.update({
    where: { id: lock.id },
    data: { state: "locked", everLocked: true, lockedAt: new Date() },
  });

  if (layerType === "acceptance_criteria") {
    await snapshotApprovedBaseline(prototypeId);
    await recordApprovedRoadmapVersion({ initiativeId: prototype.initiativeId, prototypeId, approvedByUserId: actor.id });
  }

  await auditInitiative(prototype.initiativeId, "plan.locked", { layerType });

  return { regenerated };
}

/**
 * Unlocking a layer unlocks it and every layer beneath it — an ancestor can
 * never be open for editing while a descendant claims to be final.
 */
export async function unlockLayer(prototypeId: string, layerType: LayerType): Promise<void> {
  return withTransaction(async () => {
  await requireLockAuthority(prototypeId);
  const idx = LAYER_SEQUENCE.indexOf(layerType);
  if (idx < 0) throw new Error(`Unknown layer: ${layerType}`);
  await db.layerLock.updateMany({
    where: { prototypeId, sequence: { gte: idx + 1 } },
    data: { state: "unlocked" },
  });
  const prototype = await db.prototype.findUniqueOrThrow({ where: { id: prototypeId }, select: { initiativeId: true } });
  await auditInitiative(prototype.initiativeId, "plan.unlocked", { layerType });
  });
}

async function requireLockAuthority(prototypeId: string) {
  const authUserId = currentAuthUserId();
  if (!authUserId) throw new Error("Authentication required.");
  const prototype = await db.prototype.findUniqueOrThrow({ where: { id: prototypeId }, include: { initiative: true } });
  const membership = await db.organizationMember.findFirst({ where: { authUserId, organizationId: prototype.initiative.organizationId, status: "active", role: { in: ["owner", "admin"] } } });
  const actor = await db.user.findUnique({ where: { authUserId } });
  if (!membership || actor?.status !== "active") throw new Error("Organization administrator required.");
  return actor;
}

/** Throws if the artifact's governing waterfall layer is locked (FR-11). */
export async function assertArtifactEditable(
  prototypeId: string,
  artifactType: ArtifactType,
): Promise<void> {
  const layerType = LAYER_FOR_ARTIFACT[artifactType];
  const lock = await db.layerLock.findUnique({
    where: { prototypeId_layerType: { prototypeId, layerType } },
  });
  if (lock?.state === "locked") {
    throw new LockedLayerError(
      `${LAYER_LABELS[layerType]} is locked. Unlock it first — note that unlocking also unlocks every layer beneath it.`,
    );
  }
}

/** FR-13: the approved prototype state, stored as the plan-health baseline. */
export async function snapshotApprovedBaseline(prototypeId: string): Promise<void> {
  const snapshot = await buildLiveSnapshot(db, prototypeId);
  await db.prototype.update({
    where: { id: prototypeId },
    data: {
      approvedBaselineJson: JSON.stringify(snapshot),
      approvedAt: new Date(),
    },
  });
}
