import { createHash } from "crypto";
import { db } from "@/lib/db";
import { moneyNumber } from "@/lib/projectContext";

// Roadmap versioning foundation (docs section: "Regeneration Rules" / "Meaningful
// Changes"). One stable hash over exactly the inputs the product spec calls
// "meaningful": the capability set and each one's priority/scope fields,
// dependency edges, and the initiative/project-level scope, go-live, and
// budget fields. Used to answer "have the approved inputs meaningfully
// changed since this roadmap was generated" without hand-writing a bespoke
// diff per spec bullet — see hasRoadmapDrifted() below and
// src/lib/generation/engine.ts's generatePrototype(), which stores this
// value on Prototype.inputsFingerprintAtGeneration at generation time.

export interface FingerprintCapability {
  id: string;
  isMvp: boolean;
  effortSize: string;
  businessValue: string;
  riskLevel: string;
  manualPhaseOverride: number | null;
}

export interface FingerprintDependencyEdge {
  fromCapabilityId: string;
  toCapabilityId: string;
}

export interface RoadmapInputsFingerprintInput {
  methodology: string;
  targetLaunchDateOverride: Date | null;
  budgetOverride: number | null;
  averageHourlyRateOverride: number | null;
  project: { budget: number | null; averageHourlyRate: number | null; targetLaunchDate: Date | null };
  capabilities: FingerprintCapability[];
  dependencyEdges: FingerprintDependencyEdge[];
}

/**
 * Pure, DB-free — unit-testable in isolation, same style as engine.ts's
 * capabilitySetDrifted. Capabilities/edges are stable-sorted first so array
 * ordering from the database (which carries no meaning here) never produces
 * a false-positive diff.
 */
export function buildFingerprintPayload(input: RoadmapInputsFingerprintInput): string {
  const capabilities = [...input.capabilities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, isMvp, effortSize, businessValue, riskLevel, manualPhaseOverride }) => ({
      id,
      isMvp,
      effortSize,
      businessValue,
      riskLevel,
      manualPhaseOverride,
    }));
  const dependencyEdges = [...input.dependencyEdges]
    .map((e) => `${e.fromCapabilityId}>${e.toCapabilityId}`)
    .sort();

  // Override-if-set, inherit-from-Project-if-null — same precedence
  // resolveInitiativeEconomics() (src/lib/projectContext.ts) applies, kept
  // inline here so this function stays single-query/DB-shape-independent
  // rather than requiring both objects pre-resolved through that helper.
  const targetLaunchDate = input.targetLaunchDateOverride ?? input.project.targetLaunchDate;
  const budget = input.budgetOverride ?? input.project.budget;
  const averageHourlyRate = input.averageHourlyRateOverride ?? input.project.averageHourlyRate;

  return JSON.stringify({
    methodology: input.methodology,
    targetLaunchDate: targetLaunchDate ? targetLaunchDate.toISOString() : null,
    budget,
    averageHourlyRate,
    capabilities,
    dependencyEdges,
  });
}

export function hashFingerprintPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

/** DB-backed convenience wrapper — the call site used everywhere except unit tests. */
export async function computeRoadmapInputsFingerprint(initiativeId: string): Promise<string> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      methodology: true,
      targetLaunchDateOverride: true,
      budgetOverride: true,
      averageHourlyRateOverride: true,
      project: { select: { budget: true, averageHourlyRate: true, targetLaunchDate: true } },
      intakeAnswerSet: {
        select: {
          capabilities: {
            select: {
              id: true,
              isMvp: true,
              effortSize: true,
              businessValue: true,
              riskLevel: true,
              manualPhaseOverride: true,
              dependsOnEdges: { select: { fromCapabilityId: true, toCapabilityId: true } },
            },
          },
        },
      },
    },
  });
  const capabilities = initiative.intakeAnswerSet?.capabilities ?? [];
  const dependencyEdges = capabilities.flatMap((c) => c.dependsOnEdges);
  return hashFingerprintPayload(
    buildFingerprintPayload({
      methodology: initiative.methodology,
      targetLaunchDateOverride: initiative.targetLaunchDateOverride,
      budgetOverride: moneyNumber(initiative.budgetOverride),
      averageHourlyRateOverride: moneyNumber(initiative.averageHourlyRateOverride),
      project: { ...initiative.project, budget: moneyNumber(initiative.project.budget), averageHourlyRate: moneyNumber(initiative.project.averageHourlyRate) },
      capabilities,
      dependencyEdges,
    }),
  );
}

/**
 * Read-only staleness check — NEVER triggers regeneration itself, only
 * informs a non-blocking UI signal (see workspace/layout.tsx). A prototype
 * generated before this feature shipped has no stored baseline fingerprint;
 * treated as "no signal," never a false positive.
 */
export async function hasRoadmapDrifted(initiativeId: string): Promise<boolean> {
  const prototype = await db.prototype.findUnique({
    where: { initiativeId },
    select: { inputsFingerprintAtGeneration: true },
  });
  if (!prototype?.inputsFingerprintAtGeneration) return false;
  const current = await computeRoadmapInputsFingerprint(initiativeId);
  return current !== prototype.inputsFingerprintAtGeneration;
}
