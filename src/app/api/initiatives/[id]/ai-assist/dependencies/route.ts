import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { runProposeDependencies } from "@/lib/ai/actions/proposeDependencies";
import { mapAssistActionError } from "@/lib/ai/assist/routeErrors";

// AI Assist trigger — PROPOSE_DEPENDENCIES (Section 4).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  try {
    const result = await runProposeDependencies({ initiativeId: id, userId: user.id, organizationId: user.organizationId });
    return NextResponse.json(result);
  } catch (err) {
    return mapAssistActionError(err);
  }
}
