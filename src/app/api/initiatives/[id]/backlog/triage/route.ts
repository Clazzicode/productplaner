import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { bulkTriageBacklog, bulkTriageCommand, listUnifiedBacklog } from "@/lib/backlog/unified";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (request.method === "GET") return Response.json({ items: await listUnifiedBacklog(id) });
  const parsed = bulkTriageCommand.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  return Response.json({ items: await bulkTriageBacklog(id, parsed.data) });
}
export const GET = withApi(handler);
export const POST = withApi(handler);
