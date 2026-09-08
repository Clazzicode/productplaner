import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partitionPhases } from "@/lib/generation/buildPlan";
import { PHASE_NAMES } from "@/lib/generation/constants";
import { loadIntakeInput, regenerateBelow } from "@/lib/generation/engine";
import { assertArtifactEditable, LockedLayerError } from "@/lib/generation/locking";
import { resolveMethodology } from "@/lib/generation/methodology";
import { movePhaseSchema } from "@/lib/validation/schemas";

const parseJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Reads every roadmap_phase row's stored membership into capabilityId -> phaseNumber. */
async function loadPhaseOf(prototypeId: string): Promise<Map<string, number>> {
  const rows = await db.artifactLayer.findMany({
    where: { prototypeId, type: "roadmap_phase" },
    select: { contentJson: true },
  });
  const phaseOf = new Map<string, number>();
  for (const row of rows) {
    const content = parseJson(row.contentJson);
    const n = (content.phaseNumber as number | undefined) ?? 1;
    for (const id of (content.capabilityIds as string[] | undefined) ?? []) phaseOf.set(id, n);
  }
  return phaseOf;
}

/**
 * Timeline drag-and-drop: reassigns a capability's roadmap phase. Persists
 * the choice as `Capability.manualPhaseOverride`, then reuses the pure
 * `partitionPhases` function (so the dependency-promotion invariant and
 * priority ordering are computed identically to a full generation) to
 * rewrite every `roadmap_phase` row's membership, then calls the existing
 * `regenerateBelow(prototypeId, "roadmap")` to rebuild features/epics/
 * stories/ACs under the new membership — no bespoke re-parenting logic.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ capId: string }> },
) {
  const { capId } = await params;
  const parsed = movePhaseSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { targetPhase } = parsed.data;

  const capability = await db.capability.findUnique({
    where: { id: capId },
    include: {
      intakeAnswerSet: {
        select: {
          initiative: {
            select: { id: true, methodology: true, prototype: { select: { id: true } } },
          },
        },
      },
    },
  });
  if (!capability) return jsonError("Capability not found.", 404);
  const initiative = capability.intakeAnswerSet.initiative;

  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, initiative.id, "edit");
  if (!guard.ok) return guard.response;

  if (!initiative.prototype) {
    return jsonError("Generate a plan before using the Timeline view.", 404);
  }
  const prototypeId = initiative.prototype.id;

  const methodology = resolveMethodology(initiative.methodology);
  if (methodology === "agile_scrum") {
    return jsonError(
      "Timeline drag isn't available for Agile/Scrum — its phase numbers are an emergent backlog rank, not an assignable category.",
      409,
    );
  }

  try {
    await assertArtifactEditable(prototypeId, "roadmap_phase");
  } catch (err) {
    if (err instanceof LockedLayerError) return jsonError(err.message, 409);
    throw err;
  }

  const beforePhaseOf = await loadPhaseOf(prototypeId);
  if (beforePhaseOf.get(capId) === targetPhase) {
    return NextResponse.json({
      ok: true,
      requestedPhase: targetPhase,
      landedPhase: targetPhase,
      cascadedMoves: [],
      warnings: [],
      regenerated: null,
    });
  }

  // Step 1: persist the override on its own — commits immediately, so the
  // next read (loadIntakeInput) sees it. Must NOT be nested inside the
  // transaction below, which uses a separate connection than `db`.
  await db.capability.update({
    where: { id: capId },
    data: { manualPhaseOverride: targetPhase },
  });

  // Step 2: recompute phase membership from the now-committed override.
  const intake = await loadIntakeInput(initiative.id);
  const newPartition = partitionPhases(intake.capabilities);

  // Step 3: rewrite every roadmap_phase row's stored membership, creating a
  // phase row if the target phase never existed yet (regenerateBelow only
  // iterates existing rows, it doesn't create them).
  await db.$transaction(
    async (tx) => {
      const existingRows = await tx.artifactLayer.findMany({
        where: { prototypeId, type: "roadmap_phase" },
      });
      const rowByNumber = new Map<number, (typeof existingRows)[number]>();
      for (const row of existingRows) {
        const n = (parseJson(row.contentJson).phaseNumber as number | undefined) ?? 1;
        rowByNumber.set(n, row);
      }
      const root = await tx.artifactLayer.findFirst({
        where: { prototypeId, type: "roadmap" },
      });

      for (const n of [1, 2, 3]) {
        const capabilityIds = (newPartition.get(n) ?? []).map((c) => c.id);
        const existing = rowByNumber.get(n);
        const priorContent = existing ? parseJson(existing.contentJson) : {};
        const contentJson = JSON.stringify({
          phaseNumber: n,
          startDate: priorContent.startDate ?? new Date().toISOString(),
          endDate: priorContent.endDate ?? new Date().toISOString(),
          capabilityIds,
        });
        if (existing) {
          await tx.artifactLayer.update({ where: { id: existing.id }, data: { contentJson } });
        } else if (capabilityIds.length > 0 && root) {
          await tx.artifactLayer.create({
            data: {
              prototypeId,
              type: "roadmap_phase",
              parentId: root.id,
              order: n - 1,
              title: PHASE_NAMES[n] ?? `Phase ${n}`,
              body: `${capabilityIds.length} ${capabilityIds.length === 1 ? "capability" : "capabilities"}, sequenced by dependencies and business value.`,
              contentJson,
              traceAnswerKeys: "q3,q4",
              traceNote: "Created when a capability was dragged into this phase on the Timeline view.",
            },
          });
        }
      }
    },
    { timeout: 60_000 },
  );

  // Step 4: rebuild features/epics/stories/ACs under the new membership.
  const regenerated = await regenerateBelow(prototypeId, "roadmap");

  // Cascade/warning reporting.
  const afterPhaseOf = await loadPhaseOf(prototypeId);
  const siblings = await db.capability.findMany({
    where: { intakeAnswerSetId: capability.intakeAnswerSetId },
    select: { id: true, name: true, isMvp: true },
  });
  const capsById = new Map(siblings.map((c) => [c.id, c]));

  const cascadedMoves: { capabilityId: string; name: string; fromPhase: number; toPhase: number }[] = [];
  for (const [id, before] of beforePhaseOf) {
    if (id === capId) continue;
    const after = afterPhaseOf.get(id);
    if (after != null && after !== before) {
      cascadedMoves.push({ capabilityId: id, name: capsById.get(id)?.name ?? id, fromPhase: before, toPhase: after });
    }
  }

  const landedPhase = afterPhaseOf.get(capId) ?? targetPhase;
  const draggedCap = capsById.get(capId);
  const warnings: string[] = [];
  if (draggedCap?.isMvp && landedPhase !== 1) {
    warnings.push(`"${draggedCap.name}" is marked required for MVP (Q4) but is no longer in Phase 1.`);
  }
  if (landedPhase !== targetPhase) {
    warnings.push(
      `Because of dependency ordering, this landed in Phase ${landedPhase} instead of Phase ${targetPhase}.`,
    );
  }
  for (const m of cascadedMoves) {
    warnings.push(`"${m.name}" also moved to Phase ${m.toPhase} to keep dependencies before their dependents.`);
  }

  return NextResponse.json({
    ok: true,
    requestedPhase: targetPhase,
    landedPhase,
    cascadedMoves,
    warnings,
    regenerated,
  });
}
