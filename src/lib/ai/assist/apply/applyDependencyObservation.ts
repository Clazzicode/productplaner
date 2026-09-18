import type { Prisma } from "@prisma/client";
import { DependencyAlreadyExistsError } from "@/lib/ai/errors";

interface DependencyContent {
  fromCapabilityId: string;
  toCapabilityId: string;
}

// dependency_observation -> CapabilityDependency.create, directly — there is
// no existing crystallize() path for this (its "dependency" fieldKey is a
// deliberate no-op: free-text-sourced dependencies can't reliably resolve to
// real capability ids). Safe here because proposeDependencies.ts only ever
// proposes edges between two already-real, already-approved Capabilities,
// re-validated against the live capability set at generation time.
export async function applyDependencyObservation(
  tx: Prisma.TransactionClient,
  content: DependencyContent,
): Promise<{ appliedEntityType: "capability_dependency"; appliedEntityId: string }> {
  try {
    const created = await tx.capabilityDependency.create({
      data: { fromCapabilityId: content.fromCapabilityId, toCapabilityId: content.toCapabilityId, note: "" },
      select: { id: true },
    });
    return { appliedEntityType: "capability_dependency", appliedEntityId: created.id };
  } catch {
    // Unique constraint on [fromCapabilityId, toCapabilityId] — a human
    // added this link manually in the meantime, or a repeat Apply click.
    throw new DependencyAlreadyExistsError("This dependency already exists.");
  }
}
