import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";
import {
  businessValueLevelFromScore,
  computeBusinessValueScore,
  valueFactorsFrom,
} from "@/lib/generation/scoring";
import { getEffectiveWeights } from "@/lib/planningWeights/planningWeights";
import { capabilityUpsertSchema } from "@/lib/validation/schemas";

// Capabilities stay editable post-generation (the "living plan" demo feature) — changes
// only reach the actual plan once the user explicitly recalculates it.
async function loadEditable(capId: string) {
  const capability = await db.capability.findUnique({
    where: { id: capId },
    include: {
      intakeAnswerSet: { select: { id: true, status: true, initiative: { select: { id: true } } } },
    },
  });
  if (!capability) return { error: jsonError("Feature not found.", 404) };
  return { capability };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ capId: string }> },
) {
  const { capId } = await params;
  const parsed = capabilityUpsertSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const { capability, error } = await loadEditable(capId);
  if (error) return error;

  const guard = await requireInitiativeApiAccess(authGuard.user, capability!.intakeAnswerSet.initiative.id, "edit");
  if (!guard.ok) return guard.response;

  const { dependsOn, ...fields } = parsed.data;
  if (fields.mvpImportance === "required_for_mvp" && !fields.isMvp) {
    return jsonError('MVP importance "Required for MVP" conflicts with the Q4 answer — mark the feature as MVP or lower the importance.', 422);
  }
  const factors = valueFactorsFrom(fields);
  const weights = factors
    ? ((await getEffectiveWeights(capability!.intakeAnswerSet.initiative.id, "valueFactorWeights")) as typeof VALUE_FACTOR_WEIGHTS)
    : null;
  const businessValueScore = factors && weights ? computeBusinessValueScore(factors, weights) : null;
  if (businessValueScore != null) fields.businessValue = businessValueLevelFromScore(businessValueScore);
  const siblings = await db.capability.findMany({
    where: { intakeAnswerSetId: capability!.intakeAnswerSetId, NOT: { id: capId } },
    select: { id: true },
  });
  const validDeps = dependsOn.filter((d) => siblings.some((c) => c.id === d));

  await withTransaction((tx) =>
    Promise.all([
      tx.capabilityDependency.deleteMany({ where: { fromCapabilityId: capId } }),
      tx.capability.update({
        where: { id: capId },
        data: {
          ...fields,
          businessValueScore,
          dependsOnEdges: { create: validDeps.map((toCapabilityId) => ({ toCapabilityId })) },
        },
      }),
    ]),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ capId: string }> },
) {
  const { capId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const { capability, error } = await loadEditable(capId);
  if (error) return error;

  const guard = await requireInitiativeApiAccess(authGuard.user, capability!.intakeAnswerSet.initiative.id, "edit");
  if (!guard.ok) return guard.response;

  await db.capability.delete({ where: { id: capId } });
  return NextResponse.json({ ok: true });
}
