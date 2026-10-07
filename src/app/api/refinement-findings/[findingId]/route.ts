import { NextResponse } from "next/server";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { refinementFindingUpdateSchema } from "@/lib/validation/schemas";
import { withPlanningMutation } from "@/lib/generation/mutation";

async function PATCHHandler(request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);

  const parsed = refinementFindingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const finding = await db.refinementFinding.findUnique({ where: { id: findingId } });
  if (!finding) return jsonError("Refinement finding not found.", 404);
  const access = await requireInitiativeApiAccess(auth.user, finding.initiativeId, "edit");
  if (!access.ok) return access.response;

  if (parsed.data.ownerUserId) {
    const member = await db.organizationMember.findFirst({
      where: { organizationId: finding.organizationId, user: { id: parsed.data.ownerUserId }, status: "active" },
      select: { id: true },
    });
    if (!member) return jsonError("The selected owner is not an active member of this organization.", 422);
  }

  const updated = await withPlanningMutation(finding.initiativeId, "refinement_finding.updated", () =>
    db.refinementFinding.update({
      where: { id: findingId },
      data: {
        ...parsed.data,
        resolvedAt: parsed.data.status === "resolved" ? new Date() : parsed.data.status ? null : undefined,
      },
    }),
  );
  return NextResponse.json({ finding: updated });
}

export const PATCH = withApi(PATCHHandler);
