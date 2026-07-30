import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
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
  if (intake.status === "generated") {
    return jsonError("Intake answers are permanent once the prototype is generated.", 409);
  }

  const { dependsOn, ...fields } = parsed.data;
  const validDeps = dependsOn.filter((d) => intake.capabilities.some((c) => c.id === d));
  const nextOrder = intake.capabilities.reduce((m, c) => Math.max(m, c.order + 1), 0);

  const capability = await db.capability.create({
    data: {
      intakeAnswerSetId: intake.id,
      ...fields,
      order: nextOrder,
      dependsOnEdges: {
        create: validDeps.map((toCapabilityId) => ({ toCapabilityId })),
      },
    },
  });
  return NextResponse.json({ capabilityId: capability.id });
}
