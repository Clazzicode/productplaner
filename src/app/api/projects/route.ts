import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { projectCreateSchema } from "@/lib/validation/schemas";

export async function GET() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const projects = await db.project.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { initiatives: true } } },
  });
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      goal: p.goal,
      budget: p.budget,
      averageHourlyRate: p.averageHourlyRate,
      targetLaunchDate: p.targetLaunchDate,
      initiativeCount: p._count.initiatives,
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const parsed = projectCreateSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  // A brand-new Project starts a clean context — it inherits nothing from any
  // other Project (directive §6): every field below comes only from this
  // request or the creating account/org, never copied from a sibling Project.
  const project = await db.project.create({
    data: {
      organizationId: user.organizationId,
      createdByUserId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      goal: parsed.data.goal,
      targetLaunchDate: parsed.data.targetLaunchDate ?? null,
      budget: parsed.data.budget ?? null,
      averageHourlyRate: parsed.data.averageHourlyRate,
      planningApproach: parsed.data.planningApproach,
    },
  });
  return NextResponse.json({ projectId: project.id });
}
