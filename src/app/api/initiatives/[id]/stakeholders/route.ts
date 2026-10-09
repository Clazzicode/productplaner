import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { BusinessError } from "@/lib/businessError";
import { db, establishAuthContext } from "@/lib/db";
import { withApi } from "@/lib/observability";
import {
  stakeholderAssignmentCreateSchema,
  stakeholderContactCreateSchema,
} from "@/lib/stakeholders/model";
import {
  createStakeholderAssignment,
  createStakeholderContact,
  listProjectStakeholders,
} from "@/lib/stakeholders/service";

async function context(id: string, minimum: "view" | "edit") {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, minimum);
  if (!access.ok) return access;
  const initiative = await db.initiative.findFirst({
    where: { id, organizationId: auth.user.organizationId },
    select: { projectId: true },
  });
  if (!initiative) return { ok: false as const, response: jsonError("Not found.", 404) };
  return { ok: true as const, user: auth.user, projectId: initiative.projectId };
}

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await context(id, "view");
  if (!resolved.ok) return resolved.response;
  try {
    const [stakeholders, requests, features, stories, prototype, decisions] = await Promise.all([
      listProjectStakeholders(resolved.projectId, resolved.user.organizationId, id),
      db.planningRequest.findMany({ where: { initiativeId: id, archivedAt: null }, select: { id: true, data: true }, orderBy: { updatedAt: "desc" } }),
      db.capability.findMany({ where: { intakeAnswerSet: { initiativeId: id } }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
      db.artifactLayer.findMany({ where: { prototype: { initiativeId: id }, type: "story", archivedAt: null }, select: { id: true, title: true }, orderBy: { order: "asc" } }),
      db.prototype.findUnique({ where: { initiativeId: id }, select: {
        sprints: { select: { id: true, sprintNumber: true }, orderBy: { sprintNumber: "asc" } },
        releases: { select: { id: true, name: true }, orderBy: { order: "asc" } },
      } }),
      db.decision.findMany({ where: { projectId: resolved.projectId, OR: [{ initiativeId: id }, { initiativeId: null }] }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    ]);
    return NextResponse.json({
      ...stakeholders,
      targets: {
        request: requests.map((item) => ({ id: item.id, label: typeof item.data === "object" && item.data && !Array.isArray(item.data) && "title" in item.data ? String(item.data.title) : "Planning request" })),
        feature: features.map((item) => ({ id: item.id, label: item.name })),
        story: stories.map((item) => ({ id: item.id, label: item.title })),
        sprint: prototype?.sprints.map((item) => ({ id: item.id, label: `Sprint ${item.sprintNumber}` })) ?? [],
        release: prototype?.releases.map((item) => ({ id: item.id, label: item.name })) ?? [],
        decision: decisions.map((item) => ({ id: item.id, label: item.title })),
      },
    });
  } catch (error) {
    if (error instanceof BusinessError) return jsonError(error.message, error.status);
    throw error;
  }
}

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await context(id, "edit");
  if (!resolved.ok) return resolved.response;
  const body = await request.json().catch(() => null) as { action?: unknown; data?: unknown } | null;
  if (body?.action === "create_contact") {
    const parsed = stakeholderContactCreateSchema.safeParse(body.data);
    if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
    try {
      return NextResponse.json({ contact: await createStakeholderContact(
        resolved.user.organizationId, resolved.projectId, parsed.data, resolved.user.id,
      ) }, { status: 201 });
    } catch (error) {
      if (error instanceof BusinessError) return jsonError(error.message, error.status);
      throw error;
    }
  }
  if (body?.action === "create_assignment") {
    const parsed = stakeholderAssignmentCreateSchema.safeParse(body.data);
    if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
    if (parsed.data.initiativeId && parsed.data.initiativeId !== id) return jsonError("Initiative mismatch.", 422);
    try {
      return NextResponse.json({ assignment: await createStakeholderAssignment(
        resolved.user.organizationId, resolved.projectId,
        { ...parsed.data, initiativeId: id }, resolved.user.id,
      ) }, { status: 201 });
    } catch (error) {
      if (error instanceof BusinessError) return jsonError(error.message, error.status);
      throw error;
    }
  }
  return jsonError("Choose a supported stakeholder action.", 422);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
