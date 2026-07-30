import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import { intakePatchSchema } from "@/lib/validation/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = intakePatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId: id } });
  if (!intake) return jsonError("Initiative not found.", 404);
  if (intake.status === "generated") {
    // FR-06: intake answers are permanent once the prototype exists.
    return jsonError(
      "Intake answers are permanent once the prototype is generated — they are the plan's source of truth.",
      409,
    );
  }

  await db.intakeAnswerSet.update({ where: { id: intake.id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}
