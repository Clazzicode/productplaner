import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { previewGrantChange } from "@/lib/access/mutations";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";

const previewSchema = z.object({ permission: z.enum(["owner", "edit", "view"]).nullable() });

/** Before/after preview, no mutation (docs/V2-RESOURCE-ACCESS.md §9). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const { grantId } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage access.", 403);

  const parsed = previewSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const result = await previewGrantChange(grantId, actor.organizationId, parsed.data.permission);
  if (!result.ok) return jsonError("Grant not found.", 404);
  return NextResponse.json(result.data);
}
