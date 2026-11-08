import { db } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { validateIntake } from "@/lib/generation/validateIntake";

export type PlanningEvidence = { featureCount: number; storyCount: number; criteriaCount: number; missingContext: string[];
  generationReady: boolean; generationGaps: string[]; committedSprintCount: number; approvedReleaseCount: number };
export const planningLabel = (e: PlanningEvidence) => `${e.featureCount} features · ${e.storyCount} stories · ${e.criteriaCount} criteria`;
export const commitmentLabel = (e: PlanningEvidence) => `${e.committedSprintCount} committed sprints · ${e.approvedReleaseCount} approved release decisions`;

export async function loadPlanningEvidence(initiativeId: string): Promise<PlanningEvidence> {
  const initiative = await db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, include: {
    intakeAnswerSet: { include: { _count: { select: { capabilities: true } } } }, prototype: { select: { id: true } },
  } });
  const [layers, committedSprintCount, approvedReleaseCount, input] = await Promise.all([
    initiative.prototype ? db.artifactLayer.groupBy({ by: ["type"], where: { prototypeId: initiative.prototype.id, archivedAt: null }, _count: { _all: true } }) : [],
    db.sprintPlan.count({ where: { initiativeId, status: "committed" } }),
    db.releaseReadinessAssessment.count({ where: { initiativeId, status: "approved" } }),
    initiative.intakeAnswerSet ? loadIntakeInput(initiativeId) : null,
  ]);
  const intake = initiative.intakeAnswerSet;
  const missingContext = [!intake?.problemStatement.trim() && "problem", !intake?.targetCustomer.trim() && "customer", !intake?.outcomeStatement.trim() && "outcome"].filter((value): value is string => Boolean(value));
  const generationGaps = input ? validateIntake(input).errors.map(error => error.message) : ["Add initiative context and features before generation."];
  return { featureCount: intake?._count.capabilities ?? 0, storyCount: layers.find(row => row.type === "story")?._count._all ?? 0,
    criteriaCount: layers.find(row => row.type === "acceptance_criterion")?._count._all ?? 0, missingContext,
    generationReady: generationGaps.length === 0, generationGaps, committedSprintCount, approvedReleaseCount };
}
