import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { lockLayer, LockOrderError } from "@/lib/generation/locking";
import { layerTypeSchema } from "@/lib/validation/schemas";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; layerType: string }> },
) {
  const { id, layerType } = await params;
  const parsedLayer = layerTypeSchema.safeParse(layerType);
  if (!parsedLayer.success) return jsonError("Unknown layer.", 404);

  const prototype = await db.prototype.findUnique({ where: { initiativeId: id } });
  if (!prototype) return jsonError("Prototype not found — generate it first.", 404);

  try {
    const { regenerated } = await lockLayer(prototype.id, parsedLayer.data);
    return NextResponse.json({ ok: true, regenerated });
  } catch (err) {
    if (err instanceof LockOrderError) return jsonError(err.message, 409);
    return jsonError(err instanceof Error ? err.message : "Lock failed.", 500);
  }
}
