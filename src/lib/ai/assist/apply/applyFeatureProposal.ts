import type { Prisma } from "@prisma/client";
import { crystallizeFeature } from "@/lib/context/crystallize";

// feature_proposal -> Capability.create, via the exact same crystallize
// write a human-approved ContextItem uses (Section 4 §5) — an AI-Assisted
// feature behaves identically to a document-derived one, no parallel logic.
export async function applyFeatureProposal(
  tx: Prisma.TransactionClient,
  initiativeId: string,
  content: unknown,
): Promise<{ appliedEntityType: "capability"; appliedEntityId: string }> {
  const capabilityId = await crystallizeFeature(tx, initiativeId, JSON.stringify(content));
  return { appliedEntityType: "capability", appliedEntityId: capabilityId };
}
