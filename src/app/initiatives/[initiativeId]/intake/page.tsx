import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import PlanningQuestionnaire from "@/components/questionnaire/PlanningQuestionnaire";
import WorkspaceBreadcrumb from "@/components/workspace/WorkspaceBreadcrumb";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { depthFromExperience } from "@/lib/questionnaire/roleGuidance";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { resolveInitiativeEconomics } from "@/lib/projectContext";

export const dynamic = "force-dynamic";

/** Gated at View, not Edit: this page also serves the "view intake answers"
 * link reachable from every workspace page, which a View-only user should be
 * able to open. The actual write path (POST /api/initiatives/[id]/intake) is
 * separately gated at Edit — that's the real enforcement boundary for
 * mutating answers, not this page render. */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireInitiativeView(user, initiativeId);
  const [initiative, onboarding] = await Promise.all([
    db.initiative.findUnique({
      where: { id: initiativeId },
      include: {
        qualifyingProfile: true,
        intakeAnswerSet: {
          include: {
            capabilities: { orderBy: { order: "asc" }, include: { dependsOnEdges: true } },
          },
        },
        project: { select: { budget: true, averageHourlyRate: true, targetLaunchDate: true } },
      },
    }),
    readOnboardingStateServer(),
  ]);
  if (!initiative || !initiative.intakeAnswerSet) notFound();
  const intake = initiative.intakeAnswerSet;
  const alreadyGenerated = intake.status === "generated";
  const economics = resolveInitiativeEconomics(initiative, initiative.project);

  // Guidance depth now comes from experienceLevel alone — QualifyingProfile.role no
  // longer participates (it's a legacy placeholder value, see
  // src/lib/questionnaire/legacyQualifyingDefaults.ts and docs/V2-QUESTIONNAIRE-MAP.md §6).
  const verbose = depthFromExperience(initiative.qualifyingProfile?.experienceLevel);

  return (
    <FocusedLayout>
      <WorkspaceBreadcrumb
        initiativeId={initiative.id}
        initiativeName={initiative.name}
        trailOverride="Guided Intake"
      />
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
          A planning system progressively building an understanding of your initiative — six
          sections, and you can come back and edit any of them any time.
        </p>
      )}
      <PlanningQuestionnaire
        initiativeId={initiative.id}
        workingRole={onboarding.workingRole ?? null}
        verbose={verbose}
        alreadyGenerated={alreadyGenerated}
        initialStep={1}
        productDirection={{
          name: initiative.name,
          problemStatement: intake.problemStatement,
          targetCustomer: intake.targetCustomer,
        }}
        success={{
          outcomeStatement: intake.outcomeStatement,
          outcomeMetric: intake.outcomeMetric,
          targetLaunchDate: economics.targetLaunchDate
            ? economics.targetLaunchDate.toISOString().slice(0, 10)
            : "",
          budget: economics.budget != null ? String(economics.budget) : "",
        }}
        delivery={{
          teamSize: intake.teamSize ?? "",
          sprintLengthWeeks: intake.sprintLengthWeeks,
          hoursPerSprintPerMember: intake.hoursPerSprintPerMember,
          utilizationRatePercent: intake.utilizationRatePercent,
          capacityBufferPercent: intake.capacityBufferPercent,
          hoursPerStoryPoint: intake.hoursPerStoryPoint,
          historicalVelocityPoints: intake.historicalVelocityPoints ?? "",
          averageHourlyRate: economics.averageHourlyRate != null ? String(economics.averageHourlyRate) : "",
        }}
        currentMethodology={initiative.methodology}
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
    </FocusedLayout>
  );
}
