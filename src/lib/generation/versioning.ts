import type { Prisma } from "@prisma/client";
import { db, withTransaction } from "@/lib/db";
import { computeRoadmapInputsFingerprint } from "./fingerprint";

// Roadmap versioning foundation. Kept in its own file, separate from
// locking.ts, deliberately: locking.ts already imports from engine.ts
// (regenerateBelow), and engine.ts's generatePrototype() needs to call
// ensureApprovedVersionArchived below — routing that through locking.ts
// would create a circular import (engine.ts -> locking.ts -> engine.ts).
// This file only depends on @/lib/db and ./fingerprint, so both engine.ts
// and locking.ts can import from it safely.

type Tx = Prisma.TransactionClient;

/**
 * The {capturedAt, layers, sprints, releases} snapshot shape, extracted here
 * so both locking.ts's snapshotApprovedBaseline (the real approved-baseline
 * snapshot) and the version-compare route (src/app/api/initiatives/[id]/
 * roadmap-versions/compare) build the identical shape from one place.
 */
export async function buildLiveSnapshot(tx: Tx | typeof db, prototypeId: string) {
  const [layers, sprints, releases] = await Promise.all([
    tx.artifactLayer.findMany({
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
    tx.sprint.findMany({ where: { prototypeId }, orderBy: { sprintNumber: "asc" } }),
    tx.release.findMany({ where: { prototypeId }, orderBy: { order: "asc" } }),
  ]);
  return { capturedAt: new Date().toISOString(), layers, sprints, releases };
}

async function nextVersionNumber(tx: Tx, initiativeId: string): Promise<number> {
  const latest = await tx.roadmapVersion.findFirst({
    where: { initiativeId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/**
 * Primary write path — called once, right after snapshotApprovedBaseline, by
 * POST /api/initiatives/[id]/approve-plan. Makes "Roadmap vN — Approved"
 * visible in version history immediately, not only retroactively the next
 * time a regenerate happens. At most one non-superseded "approved" row
 * exists per initiative at a time.
 */
export async function recordApprovedRoadmapVersion(args: {
  initiativeId: string;
  prototypeId: string;
  approvedByUserId: string | null;
}): Promise<{ versionNumber: number }> {
  const inputsFingerprint = await computeRoadmapInputsFingerprint(args.initiativeId);
  return withTransaction(async (tx) => {
    const prototype = await tx.prototype.findUniqueOrThrow({
      where: { id: args.prototypeId },
      select: { approvedAt: true, approvedBaselineJson: true },
    });
    if (!prototype.approvedAt || !prototype.approvedBaselineJson) {
      throw new Error("recordApprovedRoadmapVersion called before snapshotApprovedBaseline.");
    }
    await tx.roadmapVersion.updateMany({
      where: { initiativeId: args.initiativeId, status: "approved" },
      data: { status: "superseded" },
    });
    const versionNumber = await nextVersionNumber(tx, args.initiativeId);
    await tx.roadmapVersion.create({
      data: {
        initiativeId: args.initiativeId,
        versionNumber,
        status: "approved",
        snapshotJson: prototype.approvedBaselineJson,
        inputsFingerprint,
        approvedAt: prototype.approvedAt,
        approvedByUserId: args.approvedByUserId,
      },
    });
    return { versionNumber };
  });
}

/**
 * Defensive fallback, called from inside generatePrototype()'s transaction
 * immediately before its delete+recreate. Normally a no-op: for any
 * prototype approved after this feature shipped, recordApprovedRoadmapVersion
 * already created the matching row at approval time. Only fires for a
 * pre-existing approved prototype that predates this feature, or the rare
 * window where the process crashed between snapshotApprovedBaseline and
 * recordApprovedRoadmapVersion in the approve-plan route. Genuinely
 * unknowable fields (inputsFingerprint, approvedByUserId) are left
 * null/unset rather than guessed from current (already-changed) data. Must
 * run inside the same transaction as the deleteMany that follows it, so an
 * approved plan's content is never destroyed without either already having,
 * or about to gain, a history row.
 */
export async function ensureApprovedVersionArchived(
  tx: Tx,
  args: { initiativeId: string; approvedBaselineJson: string; approvedAt: Date },
): Promise<void> {
  const existing = await tx.roadmapVersion.findFirst({
    where: { initiativeId: args.initiativeId, approvedAt: args.approvedAt },
    select: { id: true },
  });
  if (existing) return;
  const versionNumber = await nextVersionNumber(tx, args.initiativeId);
  await tx.roadmapVersion.create({
    data: {
      initiativeId: args.initiativeId,
      versionNumber,
      status: "approved",
      snapshotJson: args.approvedBaselineJson,
      approvedAt: args.approvedAt,
    },
  });
}
