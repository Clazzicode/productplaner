import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { changeGrantPermission, revokeGrant } from "@/lib/access/mutations";
import { getCurrentUser } from "@/lib/auth/session";

const changeSchema = z.object({ permission: z.enum(["owner", "edit", "view"]) });

const LAST_OWNER_MESSAGE = "This is the only Owner on this initiative — grant Owner to someone else first.";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const { grantId } = await params;
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage access.", 403);

  const parsed = changeSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const result = await changeGrantPermission(grantId, actor.organizationId, parsed.data.permission);
  if (!result.ok) {
    if (result.reason === "external_above_view") return jsonError("External users can only be granted View.", 422);
    if (result.reason === "last_owner") return jsonError(LAST_OWNER_MESSAGE, 409);
    return jsonError("Grant not found.", 404);
  }
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const { grantId } = await params;
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage access.", 403);

  const result = await revokeGrant(grantId, actor.organizationId);
  if (!result.ok) {
    if (result.reason === "last_owner") return jsonError(LAST_OWNER_MESSAGE, 409);
    return jsonError("Grant not found.", 404);
  }
  return NextResponse.json(result.data);
}
