import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { buildLiveSnapshot } from "@/lib/generation/versioning";
import { diffRoadmapSnapshots, type SnapshotShape } from "@/lib/generation/versionDiff";
import { loadCostContext } from "@/lib/workspace";

async function resolveSnapshot(
  initiativeId: string,
  prototypeId: string,
  side: string,
): Promise<SnapshotShape | null> {
  if (side === "current") return buildLiveSnapshot(db, prototypeId);
  const versionNumber = Number(side);
  if (!Number.isInteger(versionNumber)) return null;
  const version = await db.roadmapVersion.findUnique({
    where: { initiativeId_versionNumber: { initiativeId, versionNumber } },
    select: { snapshotJson: true },
  });
  if (!version) return null;
  return JSON.parse(version.snapshotJson) as SnapshotShape;
}

// Roadmap versioning foundation — GET .../roadmap-versions/compare?from=1&to=current
// (each side is either "current" or an integer versionNumber). Resolves both
// sides to the same {capturedAt, layers, ...} shape and returns a small,
// spec-scoped diff summary — never a generic JSON diff.
async function GETHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "view");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return jsonError("Both 'from' and 'to' query params are required.", 422);

  const prototype = await db.prototype.findUnique({ where: { initiativeId: id }, select: { id: true } });
  if (!prototype) return jsonError("Generate a plan before comparing versions.", 404);

  const [fromSnapshot, toSnapshot, cost] = await Promise.all([
    resolveSnapshot(id, prototype.id, from),
    resolveSnapshot(id, prototype.id, to),
    loadCostContext(id, prototype.id),
  ]);
  if (!fromSnapshot) return jsonError(`Version '${from}' not found.`, 404);
  if (!toSnapshot) return jsonError(`Version '${to}' not found.`, 404);

  const diff = diffRoadmapSnapshots(fromSnapshot, toSnapshot, cost.model.costPerStoryPoint);
  return NextResponse.json({ diff });
}

export const GET = withApi(GETHandler);
