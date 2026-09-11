import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";
import {
  businessValueLevelFromScore,
  computeBusinessValueScore,
  valueFactorsFrom,
} from "@/lib/generation/scoring";
import { getEffectiveWeights } from "@/lib/planningWeights/planningWeights";
import { capabilityUpsertSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = capabilityUpsertSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const intake = await db.intakeAnswerSet.findUnique({
    where: { initiativeId: id },
    include: { capabilities: { select: { id: true, order: true } } },
  });
  if (!intake) return jsonError("Initiative not found.", 404);

  const { dependsOn, ...fields } = parsed.data;
  if (fields.mvpImportance === "required_for_mvp" && !fields.isMvp) {
    return jsonError('MVP importance "Required for MVP" conflicts with the Q4 answer — mark the feature as MVP or lower the importance.', 422);
  }
  // §2: when all four sub-factors are given, the weighted score determines the level.
  const factors = valueFactorsFrom(fields);
  const weights = factors
    ? ((await getEffectiveWeights(id, "valueFactorWeights")) as typeof VALUE_FACTOR_WEIGHTS)
    : null;
  const businessValueScore = factors && weights ? computeBusinessValueScore(factors, weights) : null;
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
