import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import {
  businessValueLevelFromScore,
  computeBusinessValueScore,
  valueFactorsFrom,
} from "@/lib/generation/scoring";
import { capabilityUpsertSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = capabilityUpsertSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const intake = await db.intakeAnswerSet.findUnique({
    where: { initiativeId: id },
    include: { capabilities: { select: { id: true, order: true } } },
  });
  if (!intake) return jsonError("Initiative not found.", 404);

  const { dependsOn, ...fields } = parsed.data;
  if (fields.mvpImportance === "required_for_mvp" && !fields.isMvp) {
    return jsonError('MVP importance "Required for MVP" conflicts with the Q4 answer — mark the capability as MVP or lower the importance.', 422);
  }
  // §2: when all four sub-factors are given, the weighted score determines the level.
  const factors = valueFactorsFrom(fields);
  const businessValueScore = factors ? computeBusinessValueScore(factors) : null;
  if (businessValueScore != null) fields.businessValue = businessValueLevelFromScore(businessValueScore);
  const validDeps = dependsOn.filter((d) => intake.capabilities.some((c) => c.id === d));
  const nextOrder = intake.capabilities.reduce((m, c) => Math.max(m, c.order + 1), 0);

  const capability = await db.capability.create({
    data: {
      intakeAnswerSetId: intake.id,
      ...fields,
      businessValueScore,
      order: nextOrder,
      dependsOnEdges: {
        create: validDeps.map((toCapabilityId) => ({ toCapabilityId })),
      },
    },
  });
  return NextResponse.json({ capabilityId: capability.id });
}
