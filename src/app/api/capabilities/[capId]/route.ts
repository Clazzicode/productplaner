import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import {
  businessValueLevelFromScore,
  computeBusinessValueScore,
  valueFactorsFrom,
} from "@/lib/generation/scoring";
import { capabilityUpsertSchema } from "@/lib/validation/schemas";

// Capabilities stay editable post-generation (the "living plan" demo feature) — changes
// only reach the actual plan once the user explicitly recalculates it.
async function loadEditable(capId: string) {
  const capability = await db.capability.findUnique({
    where: { id: capId },
    include: { intakeAnswerSet: { select: { id: true, status: true } } },
  });
  if (!capability) return { error: jsonError("Capability not found.", 404) };
  return { capability };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ capId: string }> },
) {
  const { capId } = await params;
  const parsed = capabilityUpsertSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const { capability, error } = await loadEditable(capId);
  if (error) return error;

  const { dependsOn, ...fields } = parsed.data;
  if (fields.mvpImportance === "required_for_mvp" && !fields.isMvp) {
    return jsonError('MVP importance "Required for MVP" conflicts with the Q4 answer — mark the capability as MVP or lower the importance.', 422);
  }
  const factors = valueFactorsFrom(fields);
  const businessValueScore = factors ? computeBusinessValueScore(factors) : null;
  if (businessValueScore != null) fields.businessValue = businessValueLevelFromScore(businessValueScore);
  const siblings = await db.capability.findMany({
    where: { intakeAnswerSetId: capability!.intakeAnswerSetId, NOT: { id: capId } },
    select: { id: true },
  });
  const validDeps = dependsOn.filter((d) => siblings.some((c) => c.id === d));

  await db.$transaction([
    db.capabilityDependency.deleteMany({ where: { fromCapabilityId: capId } }),
    db.capability.update({
      where: { id: capId },
      data: {
        ...fields,
        businessValueScore,
        dependsOnEdges: { create: validDeps.map((toCapabilityId) => ({ toCapabilityId })) },
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ capId: string }> },
) {
  const { capId } = await params;
  const { error } = await loadEditable(capId);
  if (error) return error;
  await db.capability.delete({ where: { id: capId } });
  return NextResponse.json({ ok: true });
}
