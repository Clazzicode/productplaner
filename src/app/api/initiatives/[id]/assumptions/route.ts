import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_ASSUMPTIONS } from "@/lib/generation/constants";
import {
  AgileLayerLockedError,
  assertAgileLayerEditable,
  loadIntakeInput,
  repackSprints,
} from "@/lib/generation/engine";
import { resolveMethodology } from "@/lib/generation/methodology";
import { assumptionsPatchSchema } from "@/lib/validation/schemas";

// Capacity/cost assumptions (§31) stay editable after generation — they are
// prototype assumptions, not intake answers (FR-06 permanence does not apply).
// Changing them recomputes only the flexible agile layers (§29 / FR-18).

const INITIATIVE_FIELDS = ["averageHourlyRate", "budget", "targetLaunchDate"] as const;
const INTAKE_FIELDS = [
  "utilizationRatePercent",
  "capacityBufferPercent",
  "hoursPerStoryPoint",
  "hoursPerSprintPerMember",
  "historicalVelocityPoints",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "view");
  if (!guard.ok) return guard.response;

  const initiative = await db.initiative.findUnique({
    where: { id },
    include: { intakeAnswerSet: true },
  });
  if (!initiative || !initiative.intakeAnswerSet) return jsonError("Initiative not found.", 404);
  const intake = initiative.intakeAnswerSet;

  return NextResponse.json({
    assumptions: {
      averageHourlyRate: initiative.averageHourlyRate ?? DEFAULT_ASSUMPTIONS.averageHourlyRate,
      budget: initiative.budget,
      targetLaunchDate: initiative.targetLaunchDate,
      sprintLengthWeeks: intake.sprintLengthWeeks,
      utilizationRatePercent: intake.utilizationRatePercent,
      capacityBufferPercent: intake.capacityBufferPercent,
      hoursPerStoryPoint: intake.hoursPerStoryPoint,
      hoursPerSprintPerMember: intake.hoursPerSprintPerMember,
      historicalVelocityPoints: intake.historicalVelocityPoints,
      teamSize: intake.teamSize,
    },
    defaults: DEFAULT_ASSUMPTIONS,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = assumptionsPatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const initiative = await db.initiative.findUnique({
    where: { id },
    include: { intakeAnswerSet: { select: { id: true } }, prototype: { select: { id: true } } },
  });
  if (!initiative || !initiative.intakeAnswerSet) return jsonError("Initiative not found.", 404);

  try {
    await assertAgileLayerEditable(id);
  } catch (err) {
    if (err instanceof AgileLayerLockedError) return jsonError(err.message, 409);
    throw err;
  }

  const initiativeData: Record<string, unknown> = {};
  const intakeData: Record<string, unknown> = {};
  for (const key of INITIATIVE_FIELDS) {
    if (key in parsed.data) initiativeData[key] = parsed.data[key];
  }
  for (const key of INTAKE_FIELDS) {
    if (key in parsed.data) intakeData[key] = parsed.data[key];
  }

  if (Object.keys(initiativeData).length > 0) {
    await db.initiative.update({ where: { id }, data: initiativeData });
  }
  if (Object.keys(intakeData).length > 0) {
    await db.intakeAnswerSet.update({
      where: { id: initiative.intakeAnswerSet.id },
      data: intakeData,
    });
  }

  // §29: capacity-input changes recompute the agile layers beneath the
  // (untouched) waterfall structure. Sprint counts and dates may shift.
  let sprints: number | null = null;
  const capacityChanged = Object.keys(intakeData).length > 0;
  if (capacityChanged && initiative.prototype) {
    const intakeInput = await loadIntakeInput(id);
    const prototypeId = initiative.prototype.id;
    const methodology = resolveMethodology(initiative.methodology);
    sprints = await db.$transaction(
      (tx) => repackSprints(tx, prototypeId, intakeInput, methodology),
      { timeout: 120_000 },
    );
  }

  return NextResponse.json({ ok: true, sprintsRepacked: sprints });
}
