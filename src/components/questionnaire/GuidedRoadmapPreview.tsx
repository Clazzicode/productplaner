"use client";

import { useState } from "react";
import RoadmapReadinessPanel from "./RoadmapReadinessPanel";
import SectionProgress, { QUESTIONNAIRE_SECTIONS } from "./SectionProgress";
import { assessRoadmapReadiness, type RoadmapReadinessInput } from "@/lib/questionnaire/roadmapReadiness";

const SECTION_DETAILS = [
  { title: "Product direction", why: "Keeps every recommendation tied to a real customer problem.", asks: ["Initiative name", "Problem statement", "Primary user or customer", "Supporting documents and known context"], output: "A shared product narrative and persona context" },
  { title: "Outcomes & constraints", why: "Makes the roadmap accountable to results and real-world limits.", asks: ["Desired outcome", "Success metric", "Target date", "Budget guardrail"], output: "Measurable goals and planning constraints" },
  { title: "Scope & priorities", why: "Turns ideas into sequenced work instead of an unranked wish list.", asks: ["Feature descriptions", "MVP versus later", "Business value", "Effort, risk, and dependencies"], output: "Prioritized features ready for decomposition" },
  { title: "Delivery capacity", why: "Prevents dates and costs from being based on imaginary capacity.", asks: ["Team size", "Sprint or flow assumptions", "Utilization and buffer", "Historical velocity and hourly rate"], output: "Capacity, cost, and forecast assumptions" },
  { title: "Ways of working", why: "Shapes the roadmap into releases and cadences the team can actually use.", asks: ["Agile, Kanban, Waterfall, or Hybrid", "Execution system", "Planning cadence", "Integration expectations"], output: "A delivery model for releases and sprints" },
  { title: "Review & build", why: "Shows exactly what is known and which estimates still need evidence.", asks: ["Readiness roadmap", "Core information gaps", "Confidence improvements", "Final assumption review"], output: "A clear next action and, when ready, a detailed product roadmap" },
] as const;

const PREVIEW_SCENARIOS: { label: string; description: string; input: RoadmapReadinessInput }[] = [
  {
    label: "Just created",
    description: "A name and a rough idea are enough to get a readiness roadmap.",
    input: {
      name: "Customer onboarding modernization", problemStatement: "Onboarding is slow", targetCustomer: "", outcomeStatement: "", outcomeMetric: "", targetLaunchDate: "", budget: "", capabilities: [], teamSize: "", historicalVelocityPoints: "",
    },
  },
  {
    label: "Partly filled",
    description: "Core answers unlock the detailed plan; remaining gaps explain its limits.",
    input: {
      name: "Customer onboarding modernization",
      problemStatement: "New customers take too long to reach their first successful outcome.",
      targetCustomer: "Operations managers at mid-market customers",
      outcomeStatement: "Reduce time to first value and increase successful onboarding completion.",
      outcomeMetric: "", targetLaunchDate: "", budget: "175000",
      capabilities: [
        { name: "Guided setup checklist", description: "Personalized steps based on account type.", isMvp: true },
        { name: "Progress dashboard", description: "", isMvp: false },
      ],
      teamSize: 5, historicalVelocityPoints: "",
    },
  },
  {
    label: "Well defined",
    description: "With the gaps addressed, the detailed roadmap can use stronger evidence.",
    input: {
      name: "Customer onboarding modernization",
      problemStatement: "New customers take too long to reach their first successful outcome.",
      targetCustomer: "Operations managers at mid-market customers",
      outcomeStatement: "Reduce time to first value and increase successful onboarding completion.",
      outcomeMetric: "Median time to first value below one day", targetLaunchDate: "2027-02-15", budget: "175000",
      capabilities: [
        { name: "Guided setup checklist", description: "Personalized steps based on account type.", isMvp: true },
        { name: "Progress dashboard", description: "Shows onboarding progress and blockers.", isMvp: false },
      ],
      teamSize: 5, historicalVelocityPoints: 30,
    },
  },
];

export default function GuidedRoadmapPreview() {
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState(0);
  const gaps = assessRoadmapReadiness(PREVIEW_SCENARIOS[scenario].input);
  const current = SECTION_DETAILS[step];

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Interactive product preview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Guided roadmap intake</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              A readiness roadmap appears as soon as an initiative exists. As answers improve, it shows the next gaps and when the detailed product roadmap can be built.
            </p>
          </div>
          <span className="w-fit rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary">Preview data · nothing is saved</span>
        </div>

        <div className="mb-7 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm" aria-label="Preview information level">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">See how the output changes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PREVIEW_SCENARIOS.map((option, index) => (
              <button key={option.label} type="button" aria-pressed={scenario === index} onClick={() => setScenario(index)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${scenario === index ? "bg-accent text-white" : "border border-neutral-200 bg-neutral-50 text-text-secondary hover:border-accent/40"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-text-secondary">{PREVIEW_SCENARIOS[scenario].description}</p>
        </div>

        <SectionProgress current={step} onJump={setStep} />
        <RoadmapReadinessPanel gaps={gaps} onNavigate={setStep} />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-7 md:p-9">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Section {step + 1} of 6</p>
            <h2 className="mt-2 text-2xl font-semibold text-text-primary">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary"><strong>Why this matters:</strong> {current.why}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {current.asks.map((ask, index) => (
                <div key={ask} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Information {index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-text-primary">{ask}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">The app provides examples, plain-language definitions, and an explanation of how this answer changes the roadmap.</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">What this section produces</p>
              <p className="mt-1 text-sm font-medium text-emerald-900">{current.output}</p>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-text-secondary disabled:opacity-30">← Back</button>
              <button type="button" disabled={step === 5} onClick={() => setStep((value) => Math.min(5, value + 1))} className="max-w-full rounded-xl bg-accent px-5 py-2.5 text-left text-sm font-semibold text-white shadow-sm disabled:opacity-30">{step === 5 ? "Readiness roadmap available" : `Continue to ${QUESTIONNAIRE_SECTIONS[step + 1]} →`}</button>
            </div>
          </section>

          <aside className="rounded-3xl border border-neutral-200 bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Detailed plan</p>
            <h2 className="mt-2 text-xl font-semibold">What richer answers unlock</h2>
            <ul className="mt-5 space-y-3 text-sm text-slate-300">
              {["Outcome-linked roadmap phases", "Prioritized MVP and later scope", "Dependency-aware sequencing", "Release and sprint forecast", "Capacity and cost assumptions", "Epics, stories, and acceptance criteria", "Risks, gaps, and decision rationale", "Traceability back to every intake answer"].map((item) => <li key={item} className="flex gap-2"><span className="text-indigo-300">✓</span><span>{item}</span></li>)}
            </ul>
            <p className="mt-6 rounded-2xl bg-white/10 p-4 text-xs leading-relaxed text-slate-300">The readiness roadmap always remains available. It tells the user what is missing before the detailed plan, and it updates as answers are added.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
