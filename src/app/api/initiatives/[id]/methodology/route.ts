import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import { generatePrototype, IntakeInvalidError } from "@/lib/generation/engine";
import { methodologyChangeSchema } from "@/lib/validation/schemas";

/**
 * Methodology is user-changeable at any time. Switching always fully
 * regenerates the plan — a different profile can have a fundamentally
 * different roadmap/lock/sprint shape, so there's no safe partial merge
 * (see recalculatePlan's "full" mode, which this reuses).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = methodologyChangeSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const initiative = await db.initiative.findUnique({ where: { id }, select: { id: true, prototype: { select: { id: true } } } });
  if (!initiative) return jsonError("Initiative not found.", 404);

  await db.initiative.update({ where: { id }, data: { methodology: parsed.data.methodology } });

  if (!initiative.prototype) {
    // No plan generated yet — the new methodology takes effect on first generation.
    return NextResponse.json({ ok: true, regenerated: false });
  }

  try {
    const { prototypeId } = await generatePrototype(id);
    return NextResponse.json({ ok: true, regenerated: true, prototypeId });
  } catch (err) {
    if (err instanceof IntakeInvalidError) {
      return NextResponse.json(
        { error: "Intake has unresolved flags.", validation: err.validation },
        { status: 422 },
      );
    }
    return jsonError(err instanceof Error ? err.message : "Methodology switch failed.", 500);
  }
}
