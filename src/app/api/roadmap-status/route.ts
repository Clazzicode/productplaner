import { withApi } from "@/lib/observability";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";
import { roadmapStatusEntityTypeSchema } from "@/lib/validation/schemas";

/** Batch read for list/card views — GET /api/roadmap-status?entityType=initiative&entityIds=a,b,c */
async function GETHandler(request: Request) {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const url = new URL(request.url);
  const entityTypeParsed = roadmapStatusEntityTypeSchema.safeParse(url.searchParams.get("entityType"));
  if (!entityTypeParsed.success) return jsonError("Invalid or missing entityType.", 422);
  const entityIds = (url.searchParams.get("entityIds") ?? "").split(",").filter(Boolean);
  if (entityIds.length === 0) return NextResponse.json({ statuses: {} });
  if (entityIds.length > 100) return jsonError("Request at most 100 entities.", 422);
  for (const entityId of entityIds) {
    const type = entityTypeParsed.data;
    if (type === "project") {
      const guard = await requireProjectApiAccess(user, entityId);
      if (!guard.ok) return guard.response;
    } else {
      let initiativeId: string | undefined;
      if (type === "initiative") initiativeId = entityId;
      else if (type === "sprint" || type === "release") {
        const row = type === "sprint"
          ? await db.sprint.findUnique({ where: { id: entityId }, select: { prototype: { select: { initiativeId: true } } } })
          : await db.release.findUnique({ where: { id: entityId }, select: { prototype: { select: { initiativeId: true } } } });
        initiativeId = row?.prototype.initiativeId;
      } else {
        const row = await db.artifactLayer.findUnique({ where: { id: entityId, type }, select: { prototype: { select: { initiativeId: true } } } });
        initiativeId = row?.prototype.initiativeId;
      }
      if (!initiativeId) return jsonError("Not found.", 404);
      const guard = await requireInitiativeApiAccess(user, initiativeId, "view");
      if (!guard.ok) return guard.response;
    }
  }

  // Org-scoped by construction (getResolvedStatuses filters on
  // user.organizationId), same "never trust a client id on its own" pattern
  // as every other route — an id from another org simply won't resolve.
  const statuses = await getResolvedStatuses(user.organizationId, entityTypeParsed.data, entityIds);
  return NextResponse.json({ statuses: Object.fromEntries(statuses) });
}

export const GET = withApi(GETHandler);
