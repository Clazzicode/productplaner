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

  // FR-06: once generated, intake is permanent — shown read-only.
  if (intake.status === "generated") {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
        <Link href="/home" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back to initiatives
        </Link>
        <h1 className="mt-4 text-2xl font-bold">{initiative.name} — intake</h1>
        <p className="mt-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          These answers are permanent — they are the source of truth every artifact in the
          prototype traces back to. The plan itself lives in the{" "}
          <Link
            href={`/initiatives/${initiative.id}/workspace/roadmap`}
            className="font-semibold underline"
          >
            planning workspace
          </Link>
          .
        </p>
        <dl className="mt-8 space-y-5 rounded-2xl border border-neutral-200 bg-white p-8 text-sm shadow-sm">
          <AnswerRow label="Q1 — Problem" value={intake.problemStatement} />
          <AnswerRow label="Q2 — Target customer" value={intake.targetCustomer} />
          <AnswerRow
            label="Q3 — Outcome"
            value={
              intake.outcomeMetric
                ? `${intake.outcomeStatement} (measured by: ${intake.outcomeMetric})`
                : intake.outcomeStatement
            }
          />
          <div>
            <dt className="font-semibold text-neutral-700">
              Q4/Q5/Q6/Q8 — Capabilities ({intake.capabilities.length})
            </dt>
            <dd className="mt-2 space-y-2">
              {intake.capabilities.map((cap) => (
                <div key={cap.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <span className="font-medium">{cap.name}</span>{" "}
                  <span className="text-neutral-500">
                    — {cap.isMvp ? "MVP" : "post-MVP"}, effort {cap.effortSize.toUpperCase()},
                    value {cap.businessValue}
                    {cap.dependsOnEdges.length > 0 &&
                      `, depends on ${cap.dependsOnEdges
                        .map(
                          (e) =>
                            intake.capabilities.find((c) => c.id === e.toCapabilityId)?.name ?? "?",
                        )
                        .join(", ")}`}
                  </span>
                </div>
              ))}
            </dd>
          </div>
          <AnswerRow
            label="Q7 — Capacity"
            value={`Team of ${intake.teamSize ?? "?"}, ${intake.sprintLengthWeeks}-week sprints, ${intake.velocityPerPersonPerSprint} pts/person/sprint, ${intake.capacityBufferPercent}% buffer`}
          />
        </dl>
      </main>
    );
  }

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
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        Guided intake — eight questions, one at a time. Your working prototype is generated
        from these answers and stays traceable to them forever.
      </p>
      <IntakeWizard
        initiativeId={initiative.id}
        initiativeName={initiative.name}
        verbose={verbose}
        intake={{
          problemStatement: intake.problemStatement,
          targetCustomer: intake.targetCustomer,
          outcomeStatement: intake.outcomeStatement,
          outcomeMetric: intake.outcomeMetric,
          teamSize: intake.teamSize,
          sprintLengthWeeks: intake.sprintLengthWeeks,
          velocityPerPersonPerSprint: intake.velocityPerPersonPerSprint,
          capacityBufferPercent: intake.capacityBufferPercent,
        }}
        capabilities={intake.capabilities.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isMvp: c.isMvp,
          effortSize: c.effortSize,
          businessValue: c.businessValue,
          dependsOn: c.dependsOnEdges.map((e) => e.toCapabilityId),
        }))}
      />
    </main>
  );
}

function AnswerRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-neutral-700">{label}</dt>
      <dd className="mt-1 text-neutral-600">{value || "—"}</dd>
    </div>
  );
}
