import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { ensureProvidersSeeded } from "@/lib/sync/integrationSeed";
import {
  connectDemo,
  disconnectDemo,
  reconnectDemo,
  runDemoSync,
} from "@/lib/sync/integrationStub";
import { integrationActionSchema } from "@/lib/validation/schemas";

export async function POST(
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
