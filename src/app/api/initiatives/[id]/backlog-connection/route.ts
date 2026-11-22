import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { jsonError, zodMessage } from "@/lib/api";
import { auditInitiative } from "@/lib/audit";
import { db, establishAuthContext, withTransaction } from "@/lib/db";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(3).max(160) }).strict(),
  z.object({ action: z.literal("create"), name: z.string().trim().min(3).max(160) }).strict(),
]);

async function context(id: string) {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return { response: auth.response } as const;
  establishAuthContext(auth.user.authUserId);
  const guard = await requireInitiativeApiAccess(auth.user, id, "edit");
  if (!guard.ok) return { response: guard.response } as const;
  const feature = await db.initiative.findUnique({
    where: { id }, select: { id: true, organizationId: true, projectId: true, backlogId: true },
  });
  if (!feature || feature.organizationId !== auth.user.organizationId) {
    return { response: jsonError("Feature not found.", 404) } as const;
  }
  return { feature } as const;
}

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await context(id);
  if ("response" in result) return result.response!;
  const backlog = result.feature.backlogId ? await db.backlog.findFirst({
    where: { id: result.feature.backlogId, projectId: result.feature.projectId, organizationId: result.feature.organizationId },
    select: { id: true, name: true },
  }) : null;
  return NextResponse.json({ backlog });
}

async function PATCHHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await context(id);
  if ("response" in result) return result.response!;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  return withTransaction(async tx => {
    const feature = await tx.initiative.findFirst({
      where: { id, organizationId: result.feature.organizationId },
      select: { id: true, projectId: true, backlogId: true },
    });
    if (!feature) return jsonError("Feature not found.", 404);
    if (parsed.data.action === "rename") {
      if (!feature.backlogId) return jsonError("Feature backlog not found.", 404);
      const backlog = await tx.backlog.update({
        where: { id: feature.backlogId, projectId: feature.projectId, organizationId: result.feature.organizationId },
        data: { name: parsed.data.name }, select: { id: true, name: true },
      });
      await auditInitiative(id, "backlog.renamed", { backlogId: backlog.id });
      return NextResponse.json({ backlogId: backlog.id, name: backlog.name });
    }
    if (feature.backlogId) return jsonError("This feature already has a backlog.", 409);
    const backlog = await tx.backlog.create({ data: {
      organizationId: result.feature.organizationId, projectId: feature.projectId, name: parsed.data.name,
    }, select: { id: true, name: true } });
    await tx.initiative.update({ where: { id }, data: { backlogId: backlog.id } });
    await auditInitiative(id, "backlog.connection_changed", { backlogId: backlog.id });
    return NextResponse.json({ backlogId: backlog.id, name: backlog.name });
  });
}

export const GET = withAuthenticatedApi(GETHandler);
export const PATCH = withAuthenticatedApi(PATCHHandler);
