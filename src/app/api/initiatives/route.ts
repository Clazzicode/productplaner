import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { ensureDraftWorkspace } from "@/lib/planning/draftWorkspace";
import { auditInitiative } from "@/lib/audit";
import { initiativeCreateSchema } from "@/lib/validation/schemas";

async function POSTHandler(request: Request) {
  const parsed = initiativeCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  if (user.memberType !== "internal") return jsonError("Only internal workspace members can create planning work.", 403);
  return withTransaction(async tx => {
  // Never trust a client-supplied projectId on its own (directive: the
  // application decides tenancy, not the request) — it must resolve to a
  // real Project in the actor's own organization, same "resolve from the DB
  // relationship chain" pattern every other route in this codebase follows.
  let projectId: string;
  if (parsed.data.projectId) {
    const project = await db.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true, organizationId: true },
    });
    if (!project || project.organizationId !== user.organizationId) {
      return jsonError("Project not found.", 404);
    }
    projectId = project.id;
  } else {
    // No Project chosen (no Project-picker UI exists yet) — auto-create a
    // fresh one from this same request, so this endpoint's existing callers
    // (the guided/simplified intake wizards) keep working unchanged.
    const project = await db.project.create({
      data: {
        organizationId: user.organizationId,
        createdByUserId: user.id,
        name: `${parsed.data.name} — Project`,
        targetLaunchDate: parsed.data.targetLaunchDate ?? null,
        budget: parsed.data.budget ?? null,
        averageHourlyRate: parsed.data.averageHourlyRate,
      },
    });
    projectId = project.id;
  }

  const initiative = await db.initiative.create({
    data: {
      organizationId: user.organizationId,
      projectId,
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      intakeMethod: parsed.data.intakeMethod ?? null,
      status: "intake_in_progress",
      intakeAnswerSet: { create: {} },
      // Formalizes the creator's existing implicit ownership as a real Owner
      // grant (docs/V2-ACCESS-TEAMS-VISIBILITY.md §19) — the same backfill
      // Step 8C applied to the two pre-existing initiatives.
      initiativeAccess: { create: { userId: user.id, permission: "owner" } },
    },
  });
  await ensureDraftWorkspace(tx, initiative.id);
  await auditInitiative(initiative.id, "intake.draft_created");
  return NextResponse.json({ initiativeId: initiative.id });
  });
}

export const POST = withAuthenticatedApi(POSTHandler);
