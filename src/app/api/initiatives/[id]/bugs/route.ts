import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "view");
  if (!access.ok) return access.response;
  const bugs = await db.bugPlanningRecord.findMany({
    where: { initiativeId: id, organizationId: auth.user.organizationId, archivedAt: null },
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    include: {
      request: { select: { data: true, sourceRecord: { select: { id: true, type: true, label: true, locator: true, fingerprint: true } } } },
      affectedCapability: { select: { id: true, name: true } },
      affectedStory: { select: { id: true, title: true } },
      affectedSprint: { select: { id: true, sprintNumber: true } },
      affectedRelease: { select: { id: true, name: true, targetDate: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ bugs });
}

export const GET = withApi(GETHandler);
