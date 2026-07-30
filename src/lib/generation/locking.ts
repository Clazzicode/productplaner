import { db } from "@/lib/db";
import { regenerateBelow, type RegenStats } from "./engine";
import {
  LAYER_FOR_ARTIFACT,
  LAYER_LABELS,
  LAYER_SEQUENCE,
  type ArtifactType,
  type LayerType,
} from "./types";

export class LockOrderError extends Error {}
export class LockedLayerError extends Error {}

/**
 * FR-12 pure rule: a waterfall layer can only lock when the layer above it is
 * already locked. Returns an error message, or null if the lock is allowed.
 * (Pure so it can be unit-tested without a database.)
 */
export function lockOrderViolation(
  locks: { layerType: string; state: string }[],
  layerType: LayerType,
): string | null {
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
  const locks = await db.layerLock.findMany({ where: { prototypeId } });
  const lock = locks.find((l) => l.layerType === layerType);
  if (!lock) throw new Error(`Unknown layer: ${layerType}`);

  const violation = lockOrderViolation(locks, layerType);
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
  }

  return { regenerated };
}

/**
 * Unlocking a layer unlocks it and every layer beneath it — an ancestor can
 * never be open for editing while a descendant claims to be final.
 */
export async function unlockLayer(prototypeId: string, layerType: LayerType): Promise<void> {
  const idx = LAYER_SEQUENCE.indexOf(layerType);
  if (idx < 0) throw new Error(`Unknown layer: ${layerType}`);
  await db.layerLock.updateMany({
    where: { prototypeId, sequence: { gte: idx + 1 } },
    data: { state: "unlocked" },
  });
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
  const [layers, sprints, releases] = await Promise.all([
    db.artifactLayer.findMany({
      where: { prototypeId },
      orderBy: [{ type: "asc" }, { order: "asc" }],
      select: {
        id: true,
        type: true,
        parentId: true,
        order: true,
        title: true,
        body: true,
        points: true,
        sprintId: true,
        sourceCapabilityId: true,
      },
    }),
    db.sprint.findMany({ where: { prototypeId }, orderBy: { sprintNumber: "asc" } }),
    db.release.findMany({ where: { prototypeId }, orderBy: { order: "asc" } }),
  ]);
  await db.prototype.update({
    where: { id: prototypeId },
    data: {
      approvedBaselineJson: JSON.stringify({
        capturedAt: new Date().toISOString(),
        layers,
        sprints,
        releases,
      }),
      approvedAt: new Date(),
    },
  });
}
