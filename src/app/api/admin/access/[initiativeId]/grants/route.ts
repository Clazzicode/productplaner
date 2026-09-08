import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { grantDirectAccess, grantTeamAccess } from "@/lib/access/mutations";
import { getCurrentUser } from "@/lib/auth/session";

const grantSchema = z.object({
  granteeType: z.enum(["user", "team"]),
  granteeId: z.string().min(1),
  permission: z.enum(["owner", "edit", "view"]),
});

const REASONS: Record<string, { message: string; status: number }> = {
  cross_tenant: { message: "That person or team isn't in your organization.", status: 403 },
  external_above_view: { message: "External users can only be granted View.", status: 422 },
  duplicate_grant: { message: "This grantee already has access to this initiative.", status: 409 },
};

/** Owner is never grantable to a team — enforced here, not just left to the
 * picker (docs/V2-ACCESS-TEAMS-VISIBILITY.md §4). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ initiativeId: string }> },
) {
  const { initiativeId } = await params;
  const actor = await getCurrentUser();
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage access.", 403);

  const parsed = grantSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { granteeType, granteeId, permission } = parsed.data;

  if (granteeType === "team" && permission === "owner") {
    return jsonError("Owner can only be granted to a person, not a team.", 422);
  }

  const result =
    granteeType === "user"
      ? await grantDirectAccess({ organizationId: actor.organizationId, initiativeId, userId: granteeId, permission })
      : await grantTeamAccess({ organizationId: actor.organizationId, initiativeId, teamId: granteeId, permission });

  if (!result.ok) {
    const reason = REASONS[result.reason] ?? { message: "Couldn't grant access.", status: 400 };
    return jsonError(reason.message, reason.status);
  }
  return NextResponse.json(result.data, { status: 201 });
}
