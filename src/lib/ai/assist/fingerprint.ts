import { db } from "@/lib/db";
import { computeRoadmapInputsFingerprint, hashFingerprintPayload } from "@/lib/generation/fingerprint";

// AI Assist fingerprints (Section 4 §3/§31) — one pure-ish payload builder
// per category, each hashing only the approved-context slice that category
// actually reasons about. Reuses computeRoadmapInputsFingerprint/
// hashFingerprintPayload from src/lib/generation/fingerprint.ts directly
// rather than duplicating them — that module stays engine-owned and
// untouched. Every function here is a read-only signal (mirrors
// hasRoadmapDrifted's existing convention): callers decide what to do with
// the result via src/lib/ai/assist/reuse.ts, nothing here writes anything.

/** Roadmap-level insights and whole-initiative feature proposals both reason
 * over "everything approved about this initiative" — the same slice
 * computeRoadmapInputsFingerprint already hashes for roadmap generation. */
export const computeRoadmapInsightFingerprint = computeRoadmapInputsFingerprint;
export const computeFeatureProposalFingerprint = computeRoadmapInputsFingerprint;

/** A hand-edit to the feature's current epic/story/AC tree also invalidates
 * a stale content proposal, not just a capability-field change — so this
 * hashes the capability plus the feature's current subtree text, not just
 * the capability alone. */
export async function computeContentProposalFingerprint(featureArtifactLayerId: string): Promise<string> {
  const feature = await db.artifactLayer.findUniqueOrThrow({
    where: { id: featureArtifactLayerId },
    select: {
      title: true,
      body: true,
      sourceCapability: {
        select: { name: true, description: true, effortSize: true, businessValue: true, riskLevel: true },
      },
      prototype: {
        select: {
          initiative: {
            select: {
              methodology: true,
              intakeAnswerSet: { select: { targetCustomer: true, outcomeStatement: true } },
            },
          },
        },
      },
      children: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          body: true,
          children: {
            orderBy: { order: "asc" },
            select: {
              title: true,
              body: true,
              children: { orderBy: { order: "asc" }, select: { title: true, body: true } },
            },
          },
        },
      },
    },
  });

  const payload = JSON.stringify({
    feature: { title: feature.title, body: feature.body },
    capability: feature.sourceCapability,
    methodology: feature.prototype.initiative.methodology,
    intake: {
      targetCustomer: feature.prototype.initiative.intakeAnswerSet?.targetCustomer ?? "",
      outcomeStatement: feature.prototype.initiative.intakeAnswerSet?.outcomeStatement ?? "",
    },
    epics: feature.children.map((epic) => ({
      title: epic.title,
      body: epic.body,
      stories: epic.children.map((story) => ({
        title: story.title,
        body: story.body,
        acs: story.children.map((ac) => ({ title: ac.title, body: ac.body })),
      })),
    })),
  });
  return hashFingerprintPayload(payload);
}

export async function computeDependencyObservationFingerprint(initiativeId: string): Promise<string> {
  const intake = await db.intakeAnswerSet.findUnique({
    where: { initiativeId },
    select: {
      capabilities: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, dependsOnEdges: { select: { toCapabilityId: true } } },
      },
    },
  });
  const capabilities = intake?.capabilities ?? [];
  const payload = JSON.stringify({
    capabilities: [...capabilities.map((c) => ({ id: c.id, name: c.name }))].sort((a, b) => a.id.localeCompare(b.id)),
    edges: capabilities.flatMap((c) => c.dependsOnEdges.map((e) => `${c.id}>${e.toCapabilityId}`)).sort(),
  });
  return hashFingerprintPayload(payload);
}

export async function computeRiskObservationFingerprint(initiativeId: string): Promise<string> {
  const [intake, risks] = await Promise.all([
    db.intakeAnswerSet.findUnique({
      where: { initiativeId },
      select: {
        problemStatement: true,
        targetCustomer: true,
        outcomeStatement: true,
        capabilities: { orderBy: { order: "asc" }, select: { id: true, name: true, riskLevel: true } },
      },
    }),
    db.risk.findMany({
      where: { initiativeId },
      select: { description: true, severity: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const payload = JSON.stringify({
    problemStatement: intake?.problemStatement ?? "",
    targetCustomer: intake?.targetCustomer ?? "",
    outcomeStatement: intake?.outcomeStatement ?? "",
    capabilities: [...(intake?.capabilities ?? [])]
      .map((c) => ({ id: c.id, name: c.name, riskLevel: c.riskLevel }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    risks: risks.map((r) => `${r.description}|${r.severity}|${r.status}`).sort(),
  });
  return hashFingerprintPayload(payload);
}

export async function computeReleaseRecommendationFingerprint(initiativeId: string): Promise<string> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      targetLaunchDateOverride: true,
      project: { select: { targetLaunchDate: true } },
      intakeAnswerSet: {
        select: {
          capabilities: {
            orderBy: { order: "asc" },
            select: { id: true, effortSize: true, businessValue: true, manualPhaseOverride: true },
          },
        },
      },
      prototype: {
        select: {
          releases: {
            orderBy: { order: "asc" },
            select: { id: true, name: true, phaseNumber: true, targetDate: true, order: true },
          },
        },
      },
    },
  });
  const payload = JSON.stringify({
    targetLaunchDate: (initiative.targetLaunchDateOverride ?? initiative.project.targetLaunchDate)?.toISOString() ?? null,
    capabilities: initiative.intakeAnswerSet?.capabilities ?? [],
    releases: initiative.prototype?.releases.map((r) => ({ ...r, targetDate: r.targetDate.toISOString() })) ?? [],
  });
  return hashFingerprintPayload(payload);
}

export async function computeSprintRecommendationFingerprint(initiativeId: string): Promise<string> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      intakeAnswerSet: {
        select: {
          teamSize: true,
          sprintLengthWeeks: true,
          velocityPerPersonPerSprint: true,
          capacityBufferPercent: true,
          hoursPerSprintPerMember: true,
          utilizationRatePercent: true,
          hoursPerStoryPoint: true,
          historicalVelocityPoints: true,
        },
      },
      prototype: {
        select: {
          sprints: {
            orderBy: { sprintNumber: "asc" },
            select: { id: true, sprintNumber: true, capacityPoints: true, status: true },
          },
        },
      },
    },
  });
  const payload = JSON.stringify({
    intake: initiative.intakeAnswerSet,
    sprints: initiative.prototype?.sprints ?? [],
  });
  return hashFingerprintPayload(payload);
}

export async function computeStatusRecommendationFingerprint(
  entityType: "project" | "initiative",
  entityId: string,
): Promise<string> {
  if (entityType === "initiative") {
    const i = await db.initiative.findUniqueOrThrow({
      where: { id: entityId },
      select: {
        status: true,
        targetLaunchDateOverride: true,
        project: { select: { targetLaunchDate: true } },
        intakeAnswerSet: { select: { problemStatement: true, targetCustomer: true, outcomeStatement: true } },
      },
    });
    return hashFingerprintPayload(
      JSON.stringify({ ...i, targetLaunchDateOverride: i.targetLaunchDateOverride?.toISOString() ?? null }),
    );
  }
  const p = await db.project.findUniqueOrThrow({
    where: { id: entityId },
    select: { targetLaunchDate: true, initiatives: { select: { status: true } } },
  });
  return hashFingerprintPayload(JSON.stringify({ ...p, targetLaunchDate: p.targetLaunchDate?.toISOString() ?? null }));
}
