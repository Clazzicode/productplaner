import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { refinementFindingUpdateSchema } from "@/lib/validation/schemas";
import {
  listRefinementFindingHistory,
  updateRefinementFinding,
} from "@/lib/refinement/service";

async function authorize(findingId: string, mode: "view" | "edit") {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return { ok: false as const, response: auth.response };
  establishAuthContext(auth.user.authUserId);
  const finding = await db.refinementFinding.findUnique({
    where: { id: findingId },
    select: { initiativeId: true },
  });
  if (!finding) return { ok: false as const, response: jsonError("Refinement finding not found.", 404) };
  const access = await requireInitiativeApiAccess(auth.user, finding.initiativeId, mode);
  if (!access.ok) return { ok: false as const, response: access.response };
  return { ok: true as const, user: auth.user, initiativeId: finding.initiativeId };
}

async function GETHandler(_request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const auth = await authorize(findingId, "view");
  if (!auth.ok) return auth.response;
  try {
    const result = await listRefinementFindingHistory(findingId);
    return NextResponse.json({ history: result.revisions });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

async function PATCHHandler(request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const auth = await authorize(findingId, "edit");
  if (!auth.ok) return auth.response;

  const parsed = refinementFindingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try {
    const updated = await updateRefinementFinding(findingId, parsed.data, auth.user.id);
    return NextResponse.json({ finding: updated });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
