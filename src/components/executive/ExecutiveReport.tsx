import { format } from "date-fns";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { DEFAULT_ASSUMPTIONS, PROTOTYPE_DISCLAIMER } from "@/lib/generation/constants";
import { costHealth, HEALTH_LABELS } from "@/lib/generation/health";
import { resolveLifecycleState, STAGE_LABEL } from "@/lib/lifecycle/resolveLifecycleState";
import { loadCostContext } from "@/lib/workspace";

// FR-19: assembled from live data on every render — no snapshot, no manual
// rebuild. Server component shared by the on-screen and print routes.
//
// Rendered as JSX (<ExecutiveReport .../>) from two page wrappers — that's
// its own separate async-component render as far as RLS auth context is
// concerned (same reason a layout can't establish context for its child
// page — see src/lib/db.ts), so it resolves the user and establishes context
// itself rather than trusting its caller to have done so.
export default async function ExecutiveReport({ initiativeId }: { initiativeId: string }) {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    include: {
      intakeAnswerSet: {
        include: {
          capabilities: {
            orderBy: { order: "asc" },
            include: { dependsOnEdges: { include: { toCapability: { select: { name: true } } } } },
          },
        },
      },
      prototype: { select: { id: true, approvedAt: true } },
      syncConnections: true,
    },
  });
  const intake = initiative.intakeAnswerSet!;
  const prototype = initiative.prototype!;

  const [phases, sprints, releases, storyCount] = await Promise.all([
    db.artifactLayer.findMany({
      where: { prototypeId: prototype.id, type: "roadmap_phase" },
      orderBy: { order: "asc" },
      include: { children: { where: { type: "feature" }, orderBy: { order: "asc" } } },
    }),
    db.sprint.findMany({
      where: { prototypeId: prototype.id },
      orderBy: { sprintNumber: "asc" },
      include: { stories: { select: { points: true } } },
    }),
    db.release.findMany({ where: { prototypeId: prototype.id }, orderBy: { order: "asc" } }),
    db.artifactLayer.count({ where: { prototypeId: prototype.id, type: "story" } }),
  ]);

  const totalPlanned = sprints.reduce(
    (n, s) => n + s.stories.reduce((m, st) => m + (st.points ?? 1), 0),
    0,
  );
  const totalCapacity = sprints.reduce((n, s) => n + s.capacityPoints, 0);
  const planStage = resolveLifecycleState({
    initiative: { id: initiative.id, status: initiative.status },
    manualReleaseCount: releases.filter((r) => r.origin === "manual").length,
    manualSprintCount: sprints.filter((s) => s.origin === "manual").length,
  }).stage;
  const jira = initiative.syncConnections.find((c) => c.tool === "jira");
  const { model } = await loadCostContext(initiativeId, prototype.id);
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const costStatus = costHealth(model.estimatedInitiativeCost, model.budget);
  const valueRank = { critical: 0, high: 1, medium: 2, low: 3, very_low: 4 } as Record<string, number>;
  const rankedCaps = [...intake.capabilities].sort(
    (a, b) => (valueRank[a.businessValue] ?? 9) - (valueRank[b.businessValue] ?? 9),
  );
  const depCaps = intake.capabilities.filter((c) => c.dependsOnEdges.length > 0);

  return (
    <article className="mx-auto max-w-3xl">
      {/* Title */}
      <header className="border-b-4 border-indigo-600 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Executive presentation · generated {format(new Date(), "MMM d, yyyy 'at' h:mm a")}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{initiative.name}</h1>
        <p className="mt-3 text-neutral-600">
          <strong>Problem:</strong> {intake.problemStatement}
        </p>
        <p className="mt-2 text-neutral-600">
          <strong>Outcome:</strong> {intake.outcomeStatement}
          {intake.outcomeMetric && (
            <span className="text-neutral-500"> — measured by {intake.outcomeMetric}</span>
          )}
        </p>
      </header>

      {/* Roadmap */}
      <Section title="Roadmap">
        <div className="space-y-3">
          {phases.map((phase) => (
            <div key={phase.id} className="rounded-xl border border-neutral-200 p-4">
              <p className="font-semibold">{phase.title}</p>
              <p className="mt-1 text-sm text-neutral-500">
                {phase.children.map((f) => f.title).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Scope */}
      <Section title="Scope">
        <p className="text-sm text-neutral-600">
          <strong>{intake.capabilities.filter((c) => c.isMvp).length}</strong> features in
          the MVP, <strong>{intake.capabilities.filter((c) => !c.isMvp).length}</strong>{" "}
          sequenced after — {storyCount} sprint-ready stories in total.
        </p>
        <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {intake.capabilities.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  c.isMvp ? "bg-indigo-100 text-indigo-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {c.isMvp ? "MVP" : "LATER"}
              </span>
              {c.name}
            </li>
          ))}
        </ul>
      </Section>

      {/* Value */}
      <Section title="Business value">
        <ol className="space-y-1 text-sm text-neutral-600">
          {rankedCaps.slice(0, 5).map((c, i) => (
            <li key={c.id}>
              {i + 1}. <strong>{c.name}</strong> — {c.businessValue.replace("_", " ")} value
              {c.businessValueScore != null && ` (weighted score ${c.businessValueScore} / 5)`}
            </li>
          ))}
        </ol>
      </Section>

      {/* Delivery */}
      <Section title="Delivery plan">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Releases" value={String(releases.length)} />
          <Stat label="Sprints" value={String(sprints.length)} />
          <Stat
            label="Capacity utilization"
            value={`${totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0}%`}
          />
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-neutral-600">
          {releases.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong> — ships {format(r.targetDate, "MMMM d, yyyy")}
            </li>
          ))}
        </ul>
      </Section>

      {/* Cost forecast */}
      <Section title="Cost forecast">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Estimated initiative cost" value={money(model.estimatedInitiativeCost)} />
          <Stat label="Cost per sprint" value={money(model.sprintLaborCost)} />
          <Stat label="Cost per story point" value={money(model.costPerStoryPoint)} />
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-neutral-600">
          <li>
            Planned work cost: <strong>{money(model.plannedWorkCost)}</strong> across{" "}
            {model.totalPlannedPoints} story points; unused capacity reserve{" "}
            {money(model.unusedCapacityCost)}.
          </li>
          {model.budget != null && model.budgetVariance && costStatus && (
            <li>
              Against the {money(model.budget)} budget:{" "}
              <strong>
                {model.budgetVariance.amount >= 0
                  ? `${money(model.budgetVariance.amount)} over (${model.budgetVariance.percent}%)`
                  : `${money(Math.abs(model.budgetVariance.amount))} under`}
              </strong>{" "}
              — {HEALTH_LABELS[costStatus].toLowerCase()}.
            </li>
          )}
          <li>
            Assumptions: ${model.averageHourlyRate}/hr blended rate ·{" "}
            {intake.utilizationRatePercent}% utilization · {intake.capacityBufferPercent}% buffer ·{" "}
            {intake.hoursPerStoryPoint} hrs/story point
            {model.averageHourlyRate === DEFAULT_ASSUMPTIONS.averageHourlyRate &&
              " (prototype defaults)"}
            .
          </li>
        </ul>
      </Section>

      {/* Dependencies */}
      {depCaps.length > 0 && (
        <Section title="Key dependencies">
          <ul className="space-y-1 text-sm text-neutral-600">
            {depCaps.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> depends on{" "}
                {c.dependsOnEdges.map((e) => e.toCapability.name).join(", ")}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Status */}
      <Section title="Plan status">
        <ul className="space-y-1 text-sm text-neutral-600">
          <li>
            Progress: <strong>{STAGE_LABEL[planStage]}</strong>
          </li>
          {prototype.approvedAt && (
            <li>
              Approved baseline: <strong>stored {format(prototype.approvedAt, "MMM d, yyyy")}</strong>
            </li>
          )}
          <li>
            Execution tool:{" "}
            <strong>
              {jira?.status === "connected"
                ? `Jira connected${jira.lastSyncedAt ? `, last synced ${format(jira.lastSyncedAt, "MMM d, h:mm a")}` : ""}`
                : "not connected"}
            </strong>
          </li>
        </ul>
      </Section>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-400">
        <p>
          Generated live from the working prototype — the plan of record lives in the Guided
          Product Planning Platform. This document is a view, not the source.
        </p>
        <p className="mt-2">{PROTOTYPE_DISCLAIMER}</p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-600">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  );
}
