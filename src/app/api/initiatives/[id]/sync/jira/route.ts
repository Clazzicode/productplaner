import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { connectJira, syncToJira } from "@/lib/sync/jiraStub";
import { syncActionSchema } from "@/lib/validation/schemas";

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const roleGuard = requireOrganizationRole(authGuard.user, ["owner", "admin"]);
  if (!roleGuard.ok) return roleGuard.response;
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = syncActionSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  try {
    if (parsed.data.action === "connect") {
      const conn = await connectJira(id);
      return NextResponse.json({ ok: true, status: conn.status });
    }
    const result = await syncToJira(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Sync failed.", 409);
  }
}

export const POST = withApi(POSTHandler);
