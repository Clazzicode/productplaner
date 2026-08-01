import Link from "next/link";
import { notFound } from "next/navigation";
import IntakeWizard from "@/components/intake/IntakeWizard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    include: {
      qualifyingProfile: true,
      intakeAnswerSet: {
        include: {
          capabilities: { orderBy: { order: "asc" }, include: { dependsOnEdges: true } },
        },
      },
    },
  });
  if (!initiative || !initiative.intakeAnswerSet) notFound();
  const intake = initiative.intakeAnswerSet;
  const alreadyGenerated = intake.status === "generated";

  const verbose =
    ["first_time", "some_experience"].includes(initiative.qualifyingProfile?.experienceLevel ?? "") ||
    ["business_analyst", "founder_first_timer", "project_manager"].includes(
      initiative.qualifyingProfile?.role ?? "",
    );

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/home" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Back to initiatives
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{initiative.name}</h1>
      {alreadyGenerated ? (
        <p className="mt-1 mb-8 text-sm text-neutral-500">
          Editable at any time — it&apos;s the living source of your plan, not a one-time form.
          Changes here don&apos;t touch the generated plan until you explicitly{" "}
          <Link
            href={`/initiatives/${initiative.id}/workspace/roadmap`}
            className="font-medium text-indigo-600 underline"
          >
            recalculate it in the workspace
          </Link>
          .
        </p>
      ) : (
        <p className="mt-1 mb-8 text-sm text-neutral-500">
          Guided intake — eight questions, one at a time. Your working prototype is generated
          from these answers, and you can come back and edit them any time.
        </p>
      )}
      <IntakeWizard
        initiativeId={initiative.id}
        initiativeName={initiative.name}
        verbose={verbose}
        alreadyGenerated={alreadyGenerated}
        intake={{
          problemStatement: intake.problemStatement,
          targetCustomer: intake.targetCustomer,
          outcomeStatement: intake.outcomeStatement,
          outcomeMetric: intake.outcomeMetric,
          teamSize: intake.teamSize,
          sprintLengthWeeks: intake.sprintLengthWeeks,
          velocityPerPersonPerSprint: intake.velocityPerPersonPerSprint,
          capacityBufferPercent: intake.capacityBufferPercent,
          hoursPerSprintPerMember: intake.hoursPerSprintPerMember,
          utilizationRatePercent: intake.utilizationRatePercent,
          hoursPerStoryPoint: intake.hoursPerStoryPoint,
          historicalVelocityPoints: intake.historicalVelocityPoints,
        }}
        capabilities={intake.capabilities.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isMvp: c.isMvp,
          effortSize: c.effortSize,
          businessValue: c.businessValue,
          riskLevel: c.riskLevel,
          mvpImportance: c.mvpImportance,
          customerImpactScore: c.customerImpactScore,
          revenueImpactScore: c.revenueImpactScore,
          strategicAlignmentScore: c.strategicAlignmentScore,
          riskComplianceScore: c.riskComplianceScore,
          dependsOn: c.dependsOnEdges.map((e) => e.toCapabilityId),
        }))}
      />
    </main>
  );
}
