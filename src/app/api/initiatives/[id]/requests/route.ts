import { z } from "zod";
import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { requestSchema } from "@/lib/requests/model";
import { requestRecord, saveRequest, promoteRequest } from "@/lib/requests/service";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: requestSchema, existing: z.object({ id: z.string().min(1), revision: z.number().int().positive() }).optional() }).strict(),
  z.object({ action: z.literal("promote"), id: z.string().min(1), revision: z.number().int().positive() }).strict(),
]);

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (request.method === "GET") {
    const rows = await db.planningRequest.findMany({ where: { initiativeId: id }, orderBy: { updatedAt: "desc" } });
    return Response.json({ requests: rows.map(requestRecord) });
  }
  const parsed = command.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const value = parsed.data;
  const row = value.action === "save" ? await saveRequest(id, value.data, value.existing) : await promoteRequest(id, value.id, value.revision);
  return Response.json({ request: row });
}
export const GET = withApi(handler);
export const POST = withApi(handler);
