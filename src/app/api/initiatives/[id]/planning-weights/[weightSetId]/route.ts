import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { getResolvedAccess, type ActorRow } from "@/lib/access/initiativeAccess";
import { meetsMinimum } from "@/lib/access/resolution";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { canEditPlanningWeights } from "@/lib/planningWeights/permissions";
import {
  getEffectiveWeights,
  InvalidWeightSetError,
  resetWeightConfiguration,
  saveWeightConfiguration,
} from "@/lib/planningWeights/planningWeights";
import { WEIGHT_SETS, type WeightSetId } from "@/lib/planningWeights/weightRegistry";

// Explicit Planning Rules / Explainable Scoring foundations. "Appropriate
// experience or permissions" is enforced here (canEditPlanningWeights), on
// top of the ordinary "view" initiative-access gate every API route already
// requires — see src/lib/planningWeights/permissions.ts for the rule itself.

function isWeightSetId(id: string): id is WeightSetId {
  return Object.prototype.hasOwnProperty.call(WEIGHT_SETS, id);
}

async function loadGate(actor: ActorRow, initiativeId: string, weightSetId: string) {
  if (!isWeightSetId(weightSetId)) {
    return { ok: false as const, response: jsonError("Unknown weight set.", 404) };
  }

  const access = await getResolvedAccess(actor, initiativeId);
  if (access === "not_found") return { ok: false as const, response: jsonError("Initiative not found.", 404) };
  if (!meetsMinimum(access.level, "view")) return { ok: false as const, response: jsonError("Not authorized.", 403) };

  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    select: { qualifyingProfile: { select: { experienceLevel: true } } },
  });

  const canEdit = canEditPlanningWeights({
    actorStatus: actor.status,
    accessLevel: actor.accessLevel,
    initiativePermission: access.level,
    initiativeExperienceLevel: initiative?.qualifyingProfile?.experienceLevel ?? null,
  });

  return { ok: true as const, canEdit };
}

async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ id: string; weightSetId: string }> },
) {
  const { id, weightSetId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const gate = await loadGate(authGuard.user, id, weightSetId);
  if (!gate.ok) return gate.response;
  if (!gate.canEdit) {
    return jsonError("You don't have permission to edit scoring weights for this initiative.", 403);
  }

  const body = (await request.json().catch(() => null)) as { weights?: unknown } | null;
  if (!body || typeof body.weights !== "object" || body.weights === null || Array.isArray(body.weights)) {
    return jsonError("A weights object is required.", 422);
  }

  try {
    await saveWeightConfiguration(id, weightSetId as WeightSetId, body.weights as Record<string, unknown>);
  } catch (err) {
    if (err instanceof InvalidWeightSetError) return jsonError(err.message, 422);
    throw err;
  }
  const weights = await getEffectiveWeights(id, weightSetId as WeightSetId);
  return NextResponse.json({ weights });
}

async function DELETEHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string; weightSetId: string }> },
) {
  const { id, weightSetId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);

  const gate = await loadGate(authGuard.user, id, weightSetId);
  if (!gate.ok) return gate.response;
  if (!gate.canEdit) {
    return jsonError("You don't have permission to edit scoring weights for this initiative.", 403);
  }

  await resetWeightConfiguration(id, weightSetId as WeightSetId);
  const weights = await getEffectiveWeights(id, weightSetId as WeightSetId);
  return NextResponse.json({ weights });
}

export const PATCH = withApi(PATCHHandler);
export const DELETE = withApi(DELETEHandler);
