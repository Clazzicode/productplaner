import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { requireOrganizationRole } from "@/lib/access/organizationRole";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";
import {
  connectDemo,
  disconnectDemo,
  reconnectDemo,
  runDemoSync,
} from "@/lib/sync/integrationStub";
import { integrationActionSchema } from "@/lib/validation/schemas";

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ providerKey: string }> },
) {
  const { providerKey } = await params;
  const parsed = integrationActionSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const roleGuard = requireOrganizationRole(user, ["owner", "admin"]);
  if (!roleGuard.ok) return roleGuard.response;
  if (parsed.data.initiativeId) {
    const access = await requireInitiativeApiAccess(user, parsed.data.initiativeId, "edit");
    if (!access.ok) return access.response;
  }
  if (parsed.data.connectionId) {
    const connection = await db.integrationConnection.findFirst({
      where: { id: parsed.data.connectionId, organizationId: user.organizationId, provider: { key: providerKey } },
      select: { initiativeId: true },
    });
    if (!connection) return jsonError("Connection not found.", 404);
    if (connection.initiativeId) {
      const access = await requireInitiativeApiAccess(user, connection.initiativeId, "edit");
      if (!access.ok) return access.response;
    }
  }
  await ensureProvidersSeeded();
  const body = parsed.data;

  try {
    switch (body.action) {
      case "connect":
      case "configure": {
        const connection = await connectDemo({
          organizationId: user.organizationId,
          providerKey,
          initiativeId: body.initiativeId ?? null,
          configuredByUserId: user.id,
          workspaceName: body.workspaceName,
          workspaceUrl: body.workspaceUrl,
          projectKey: body.projectKey,
          projectName: body.projectName,
          settings: body.settings,
        });
        return NextResponse.json({ connectionId: connection.id, status: connection.status });
      }
      case "sync": {
        if (!body.connectionId) return jsonError("connectionId is required to sync.", 422);
        const result = await runDemoSync(body.connectionId);
        return NextResponse.json(result);
      }
      case "disconnect": {
        if (!body.connectionId) return jsonError("connectionId is required.", 422);
        await disconnectDemo(body.connectionId);
        return NextResponse.json({ ok: true });
      }
      case "reconnect": {
        if (!body.connectionId) return jsonError("connectionId is required.", 422);
        const connection = await reconnectDemo(body.connectionId);
        return NextResponse.json({ ok: true, status: connection.status });
      }
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Integration action failed.", 400);
  }
}

export const POST = withApi(POSTHandler);
