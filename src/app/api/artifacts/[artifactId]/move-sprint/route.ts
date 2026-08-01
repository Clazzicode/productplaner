import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { db } from "@/lib/db";
import { AgileLayerLockedError, assertAgileLayerEditable } from "@/lib/generation/engine";
import { moveSprintSchema } from "@/lib/validation/schemas";

// Sprint assignment is an agile-layer operation: allowed even while the
// waterfall layers above are locked (FR-12 — sprint layers stay flexible) —
// except under Waterfall, where the agile layer itself freezes once the
// baseline is approved (assertAgileLayerEditable).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await params;
  const parsed = moveSprintSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const story = await db.artifactLayer.findUnique({ where: { id: artifactId } });
  if (!story || story.type !== "story") return jsonError("Story not found.", 404);

  const prototype = await db.prototype.findUniqueOrThrow({
    where: { id: story.prototypeId },
    select: { initiativeId: true },
  });
  try {
    await assertAgileLayerEditable(prototype.initiativeId);
  } catch (err) {
    if (err instanceof AgileLayerLockedError) return jsonError(err.message, 409);
    throw err;
  }

  const sprint = await db.sprint.findUnique({
    where: {
      prototypeId_sprintNumber: {
        prototypeId: story.prototypeId,
        sprintNumber: parsed.data.sprintNumber,
      },
    },
  });
  if (!sprint) return jsonError("Sprint not found.", 404);

  await db.artifactLayer.update({
    where: { id: artifactId },
    data: { sprintId: sprint.id },
  });
  return NextResponse.json({ ok: true });
}
