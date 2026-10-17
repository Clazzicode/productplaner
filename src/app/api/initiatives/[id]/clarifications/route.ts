import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { jsonError, zodMessage } from "@/lib/api";
import { BusinessError } from "@/lib/businessError";
import { clarificationCreateSchema } from "@/lib/clarifications/model";
import { clarificationInclude, createClarification } from "@/lib/clarifications/service";

async function handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, request.method === "GET" ? "view" : "edit");
  if (!access.ok) return access.response;
  if (request.method === "GET") {
    const sprintId = new URL(request.url).searchParams.get("sprintId");
    const rows = await db.inSprintClarification.findMany({
      where: { initiativeId: id, ...(sprintId ? { sprintId } : {}) }, include: clarificationInclude,
      orderBy: { createdAt: "desc" },
    });
    const rank: Record<string, number> = { open: 0, answered: 1, acknowledged: 2, resolved: 3, withdrawn: 4 };
    rows.sort((left, right) => (rank[left.status] ?? 99) - (rank[right.status] ?? 99) || right.createdAt.getTime() - left.createdAt.getTime());
    return Response.json({ clarifications: rows });
  }
  const parsed = clarificationCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  try { return Response.json({ clarification: await createClarification(id, parsed.data, auth.user.id) }, { status: 201 }); }
  catch (error) { if (error instanceof BusinessError) return jsonError(error.message, error.status); throw error; }
}

export const GET = withApi(handler);
export const POST = withApi(handler);

