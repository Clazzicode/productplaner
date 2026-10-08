import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { createManualRelease } from "@/lib/generation/manualScheduling";
import { createReleaseSchema } from "@/lib/validation/schemas";

/** Explicit release creation. Validation, approved-plan protection, history
 * and audit are committed together by the manual scheduling service.
 */
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = createReleaseSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const release = await createManualRelease(id, parsed.data);

  return NextResponse.json({ ok: true, release });
}

export const POST = withApi(POSTHandler);
