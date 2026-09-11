import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { unlockLayer } from "@/lib/generation/locking";
import { layerTypeSchema } from "@/lib/validation/schemas";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; layerType: string }> },
) {
  const { id, layerType } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsedLayer = layerTypeSchema.safeParse(layerType);
  if (!parsedLayer.success) return jsonError("Unknown layer.", 404);

  const prototype = await db.prototype.findUnique({ where: { initiativeId: id } });
  if (!prototype) return jsonError("Prototype not found — generate it first.", 404);

  await unlockLayer(prototype.id, parsedLayer.data);
  return NextResponse.json({ ok: true });
}
