import { notFound, redirect } from "next/navigation";
import GenerationReviewSummary, { type AssumptionRow } from "@/components/review/GenerationReviewSummary";
import { requireInitiativeView } from "@/lib/access/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_ASSUMPTIONS } from "@/lib/generation/constants";
import { computeEffectiveCapacity } from "@/lib/generation/cost";
import { loadIntakeInput } from "@/lib/generation/engine";
import { validateIntake } from "@/lib/generation/validateIntake";

export const dynamic = "force-dynamic";

export default async function GenerationReviewPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await getCurrentUser();
  await requireInitiativeView(user.id, initiativeId);
  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    include: {
      intakeAnswerSet: true,
      prototype: { include: { sprints: true, releases: true } },
    },
  });
  if (!initiative || !initiative.intakeAnswerSet) notFound();
  if (!initiative.prototype) redirect(`/initiatives/${initiativeId}/intake`);
  const intakeRow = initiative.intakeAnswerSet;
  const prototype = initiative.prototype;

  const grouped = await db.artifactLayer.groupBy({
    by: ["type"],
    where: { prototypeId: prototype.id },
    _count: { _all: true },
  });
  const count = (t: string) => grouped.find((g) => g.type === t)?._count._all ?? 0;

  const intakeInput = await loadIntakeInput(initiativeId);
  const warnings = validateIntake(intakeInput).warnings;
  const capacityPoints = computeEffectiveCapacity(intakeInput);

  const d = DEFAULT_ASSUMPTIONS;
  const rate = initiative.averageHourlyRate ?? d.averageHourlyRate;
  const assumptions: AssumptionRow[] = [
    { label: "Team size", value: `${intakeRow.teamSize ?? "?"} people`, isDefault: false },
    {
      label: "Sprint length",
      value: `${intakeRow.sprintLengthWeeks} weeks`,
      isDefault: intakeRow.sprintLengthWeeks === d.sprintLengthWeeks,
    },
    {
      label: "Hours per member per sprint",
      value: `${intakeRow.hoursPerSprintPerMember} hrs`,
      isDefault: intakeRow.hoursPerSprintPerMember === d.hoursPerSprintPerMember,
    },
    {
      label: "Utilization",
      value: `${intakeRow.utilizationRatePercent}%`,
      isDefault: intakeRow.utilizationRatePercent === d.utilizationRatePercent,
    },
    {
      label: "Capacity buffer",
      value: `${intakeRow.capacityBufferPercent}%`,
      isDefault: intakeRow.capacityBufferPercent === d.capacityBufferPercent,
    },
    {
      label: "Hours per story point",
      value: `${intakeRow.hoursPerStoryPoint} hrs`,
      isDefault: intakeRow.hoursPerStoryPoint === d.hoursPerStoryPoint,
    },
    {
      label: "Average hourly rate",
      value: `$${rate}/hr`,
      isDefault: rate === d.averageHourlyRate,
    },
    {
      label: "Available budget",
      value: initiative.budget != null ? `$${initiative.budget.toLocaleString()}` : "Not set",
      isDefault: initiative.budget == null,
    },
    {
      label: "Historical velocity",
      value:
        intakeRow.historicalVelocityPoints != null
          ? `${intakeRow.historicalVelocityPoints} pts/sprint`
          : "None — estimated from hours",
      isDefault: intakeRow.historicalVelocityPoints == null,
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <GenerationReviewSummary
        initiativeId={initiativeId}
        initiativeName={initiative.name}
        counts={{
          phases: count("roadmap_phase"),
          features: count("feature"),
          epics: count("epic"),
          stories: count("story"),
          acs: count("acceptance_criterion"),
          sprints: prototype.sprints.length,
          releases: prototype.releases.length,
        }}
        capacityPoints={capacityPoints}
        assumptions={assumptions}
        warnings={warnings}
      />
    </main>
  );
}
