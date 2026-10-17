import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { demoCreateSchema } from "@/lib/demos/model";
import { createDemoItem, demoInclude } from "@/lib/demos/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const auth = await requireCurrentUserApi(); if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId); const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit"); if (!access.ok) return access.response;
  if (request.method === "GET") return Response.json({ demos: await db.demoItem.findMany({ where: { initiativeId: id }, include: demoInclude, orderBy: [{ sprint: { sprintNumber: "desc" } }, { plannedOrder: "asc" }, { createdAt: "asc" }] }) });
  const parsed = demoCreateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ demo: await createDemoItem(id, parsed.data, auth.user.id) }, { status: 201 }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}
export const GET = withApi(handler); export const POST = withApi(handler);
