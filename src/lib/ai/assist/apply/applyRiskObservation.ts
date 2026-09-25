import type { Prisma } from "@prisma/client";
import { crystallizeRisk, type CrystallizeTarget } from "@/lib/context/crystallize";

// risk_observation -> Risk.create, via the exact same crystallize write a
// human-approved ContextItem uses (Section 4 §5).
export async function applyRiskObservation(
  tx: Prisma.TransactionClient,
  target: CrystallizeTarget,
  content: unknown,
): Promise<{ appliedEntityType: "risk"; appliedEntityId: string }> {
  const riskId = await crystallizeRisk(tx, target, JSON.stringify(content));
  return { appliedEntityType: "risk", appliedEntityId: riskId };
}
