import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

// Roadmap versioning foundation — lists the append-only RoadmapVersion
// history plus a synthesized "current" entry for the live Prototype, so the
// version panel has one flat list to render (never a second data path for
// "current" vs. "history" — see src/lib/generation/versioning.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "view");
  if (!guard.ok) return guard.response;

  const [history, prototype] = await Promise.all([
    db.roadmapVersion.findMany({
      where: { initiativeId: id },
      orderBy: { versionNumber: "desc" },
      select: {
        versionNumber: true,
        status: true,
        approvedAt: true,
        approvedByUserId: true,
        createdAt: true,
      },
    }),
    db.prototype.findUnique({
      where: { initiativeId: id },
      select: { approvedAt: true, updatedAt: true },
    }),
  ]);

  if (!prototype) return jsonError("Generate a plan before viewing its version history.", 404);

  const recordedCurrent = prototype.approvedAt
    ? history.find((v) => v.approvedAt?.getTime() === prototype.approvedAt?.getTime())
    : undefined;

  const versions = recordedCurrent
    ? history.map((v) => ({ ...v, isCurrent: v === recordedCurrent }))
    : [
        {
          versionNumber: (history[0]?.versionNumber ?? 0) + 1,
          status: prototype.approvedAt ? "approved" : "draft",
          approvedAt: prototype.approvedAt,
          approvedByUserId: null,
          createdAt: prototype.updatedAt,
          isCurrent: true,
        },
        ...history,
      ];

  return NextResponse.json({ versions });
}
