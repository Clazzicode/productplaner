import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";
import { roadmapStatusEntityTypeSchema } from "@/lib/validation/schemas";

/** Batch read for list/card views — GET /api/roadmap-status?entityType=initiative&entityIds=a,b,c */
export async function GET(request: Request) {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const url = new URL(request.url);
  const entityTypeParsed = roadmapStatusEntityTypeSchema.safeParse(url.searchParams.get("entityType"));
  if (!entityTypeParsed.success) return jsonError("Invalid or missing entityType.", 422);
  const entityIds = (url.searchParams.get("entityIds") ?? "").split(",").filter(Boolean);
  if (entityIds.length === 0) return NextResponse.json({ statuses: {} });

  // Org-scoped by construction (getResolvedStatuses filters on
  // user.organizationId), same "never trust a client id on its own" pattern
  // as every other route — an id from another org simply won't resolve.
  const statuses = await getResolvedStatuses(user.organizationId, entityTypeParsed.data, entityIds);
  return NextResponse.json({ statuses: Object.fromEntries(statuses) });
}
