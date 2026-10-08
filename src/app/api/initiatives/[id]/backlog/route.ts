import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { backlogCommand, featureRecord } from "@/lib/backlog/model";
import { listFeatures, saveFeature, reorderFeatures } from "@/lib/backlog/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (request.method === "GET") return Response.json({ features: (await listFeatures(id)).map(featureRecord) });
  const parsed = backlogCommand.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const command = parsed.data;
  if (command.action === "save") {
    return Response.json({ feature: featureRecord(await saveFeature(id, command.data, command.existing, { reason: command.reason })) });
  }
  return Response.json({ features: (await reorderFeatures(id, command.items)).map(featureRecord) });
}
export const GET = withApi(handler);
export const POST = withApi(handler);
