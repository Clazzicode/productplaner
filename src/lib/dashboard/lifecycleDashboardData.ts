// Guided-activation restructure (reference doc §7/§8, Block 4). Lightweight
// data loader for /home's pre-`active_execution` stages (ActivationHome +
// LifecycleDashboard) — deliberately NOT a rewrite of globalDashboardData.ts,
// which stays the loader for the mature operational dashboard once a user
// reaches `active_execution`. This only ever needs: which lifecycle stage the
// user's current initiative is in (via resolveLifecycleState), and a light
// summary to show while that initiative is still ramping up.

import { db } from "@/lib/db";
import { profileFor } from "@/lib/generation/methodology";
import { resolveLifecycleState, type LifecycleResolution } from "@/lib/lifecycle/resolveLifecycleState";
import { timeOfDayGreeting } from "./globalDashboardData";

export interface LifecycleInitiativeSummary {
  id: string;
  name: string;
  methodologyLabel: string;
  targetLaunchDate: Date | null;
  phaseCount: number;
  featureCount: number;
}

export interface LifecycleDashboardData {
  greeting: string;
  resolution: LifecycleResolution;
  initiativeSummary: LifecycleInitiativeSummary | null;
}

/**
 * Picks "the" initiative the same way globalDashboardData.ts's primaryInitiative
 * does (most recent generated one, else most recently touched) — kept as a
 * separate, smaller query here rather than importing that function, since this
 * loader needs a much narrower set of columns.
 */
export async function loadLifecycleDashboardData(
  userId: string,
  authorizedInitiativeIds: string[] | null,
): Promise<LifecycleDashboardData> {
  const initiatives = await db.initiative.findMany({
    where: authorizedInitiativeIds ? { id: { in: authorizedInitiativeIds } } : { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      methodology: true,
      targetLaunchDate: true,
      prototype: {
        select: {
          id: true,
          layerLocks: { where: { layerType: "roadmap" }, select: { state: true } },
          releases: { where: { origin: "manual" }, select: { id: true } },
          sprints: { where: { origin: "manual" }, select: { id: true } },
        },
      },
    },
  });

  const current = initiatives.find((i) => i.status === "generated") ?? initiatives[0] ?? null;

  const resolution = resolveLifecycleState({
    initiative: current ? { id: current.id, status: current.status } : null,
    roadmapLocked: current?.prototype?.layerLocks.some((l) => l.state === "locked") ?? false,
    manualReleaseCount: current?.prototype?.releases.length ?? 0,
    manualSprintCount: current?.prototype?.sprints.length ?? 0,
  });

  let initiativeSummary: LifecycleInitiativeSummary | null = null;
  if (current) {
    const [phaseCount, featureCount] = current.prototype
      ? await Promise.all([
          db.artifactLayer.count({ where: { prototypeId: current.prototype.id, type: "roadmap_phase" } }),
          db.artifactLayer.count({ where: { prototypeId: current.prototype.id, type: "feature" } }),
        ])
      : [0, 0];
    initiativeSummary = {
      id: current.id,
      name: current.name,
      methodologyLabel: profileFor(current.methodology).label,
      targetLaunchDate: current.targetLaunchDate,
      phaseCount,
      featureCount,
    };
  }

  return { greeting: timeOfDayGreeting(new Date()), resolution, initiativeSummary };
}
