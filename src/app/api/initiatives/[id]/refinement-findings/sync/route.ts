import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import { syncDeterministicRefinementFindings } from "@/lib/refinement/service";

async function POSTHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({
      result: await syncDeterministicRefinementFindings(id, auth.user.id),
    });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

export const POST = withApi(POSTHandler);
