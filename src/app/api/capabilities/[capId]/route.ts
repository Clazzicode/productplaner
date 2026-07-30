import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import { capabilityUpsertSchema } from "@/lib/validation/schemas";

async function loadEditable(capId: string) {
  const capability = await db.capability.findUnique({
    where: { id: capId },
    include: { intakeAnswerSet: { select: { id: true, status: true } } },
  });
  if (!capability) return { error: jsonError("Capability not found.", 404) };
  if (capability.intakeAnswerSet.status === "generated") {
    return {
      error: jsonError("Intake answers are permanent once the prototype is generated.", 409),
    };
  }
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
