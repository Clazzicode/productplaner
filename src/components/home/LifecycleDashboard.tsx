import Link from "next/link";
import type { LifecycleInitiativeSummary } from "@/lib/dashboard/lifecycleDashboardData";
import type { LifecycleResolution } from "@/lib/lifecycle/resolveLifecycleState";

const STAGE_COPY: Record<
  Exclude<LifecycleResolution["stage"], "no_initiative" | "active_execution">,
  { eyebrow: string; heading: string; description: string }
> = {
  initiative_no_plan: {
    eyebrow: "Your initiative is ready",
    heading: "Generate your initial plan",
    description: "Turn your answers into a working roadmap, features, and a delivery estimate.",
  },
  plan_generated_no_release: {
    eyebrow: "Plan generated",
    heading: "Create your first release",
    description: "Turn a roadmap phase into a real release you can plan sprints under.",
  },
  release_no_sprint: {
    eyebrow: "Release created",
    heading: "Plan your first sprint",
    description: "Scope a sprint's dates and capacity, and pull in the stories it will cover.",
  },
};

/**
 * Guided-activation restructure (reference doc §8 STATES 2-5): the dashboard
 * for an initiative that exists but hasn't yet reached full operational
 * execution — one dominant primary action per stage, initiative context
 * below it, no operational reporting (Sprints & Releases / Decisions / Risks
 * / Capacity) until `active_execution` earns the full dashboard.
 */
export default function LifecycleDashboard(props: {
  greeting: string;
  userName: string;
  resolution: LifecycleResolution;
  initiativeSummary: LifecycleInitiativeSummary;
}) {
  const firstName = props.userName.trim().split(/\s+/)[0] ?? props.userName;
  const stage = props.resolution.stage as keyof typeof STAGE_COPY;
  const copy = STAGE_COPY[stage];
  const { initiativeSummary: summary, resolution } = props;

  return (
    <div className="mx-auto max-w-2xl py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your dashboard</p>
      <h1 className="mt-1.5 break-words text-2xl font-bold text-text-primary">
        {props.greeting}, {firstName}
      </h1>

      <div className="mt-8 border-t border-border-subtle pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{copy.eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">{copy.heading}</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">{copy.description}</p>
        <Link
          href={resolution.nextAction.href}
          className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          {resolution.nextAction.label}
        </Link>
      </div>

      <div className="mt-8 border-t border-border-subtle pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Initiative summary</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-text-muted">Product</dt>
            <dd className="min-w-0 break-words text-text-primary">{summary.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-text-muted">Planning style</dt>
            <dd className="text-text-primary">{summary.methodologyLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-text-muted">Target</dt>
            <dd className="text-text-primary">
              {summary.targetLaunchDate ? summary.targetLaunchDate.toLocaleDateString() : "Not set yet"}
            </dd>
          </div>
          {stage !== "initiative_no_plan" && (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-text-muted">Plan size</dt>
              <dd className="text-text-primary">
                {summary.phaseCount} {summary.phaseCount === 1 ? "phase" : "phases"} ·{" "}
                {summary.featureCount} {summary.featureCount === 1 ? "feature" : "features"}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
