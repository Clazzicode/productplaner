"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface Question {
  key: string;
  title: string;
  subtitle: string;
  options: Option[];
}

// FR-01 (five qualifying questions) + FR-03 (methodology identification).
const QUESTIONS: Question[] = [
  {
    key: "role",
    title: "What's your role?",
    subtitle: "Your answers calibrate the language, guidance depth, and examples for the whole session.",
    options: [
      { value: "senior_pm", label: "Senior Product Manager", hint: "Concise prompts, minimal hand-holding" },
      { value: "product_owner", label: "Product Owner", hint: "Sprint-cadence emphasis" },
      { value: "business_analyst", label: "Business Analyst", hint: "Guidance and examples at every step" },
      { value: "project_manager", label: "Project Manager", hint: "Waterfall-familiar framing" },
      { value: "scrum_master", label: "Scrum Master", hint: "Sprint and capacity layers emphasized" },
      { value: "founder_first_timer", label: "Founder / first-timer", hint: "Step-by-step coaching, no jargon" },
      { value: "executive_stakeholder", label: "Executive / stakeholder", hint: "Consumes the plan" },
    ],
  },
  {
    key: "experienceLevel",
    title: "How much product planning experience do you have?",
    subtitle: "A first-timer and a senior PM produce the same quality output — only the guidance changes.",
    options: [
      { value: "first_time", label: "This is my first formal plan" },
      { value: "some_experience", label: "Some experience" },
      { value: "experienced", label: "Experienced" },
      { value: "expert", label: "Expert — I could teach this" },
    ],
  },
  {
    key: "teamComposition",
    title: "Who will execute this plan?",
    subtitle: "Team shape affects how capacity and sprint views are framed.",
    options: [
      { value: "solo", label: "Just me (for now)" },
      { value: "small_team", label: "One team" },
      { value: "multiple_teams", label: "Multiple teams" },
    ],
  },
  {
    key: "productType",
    title: "What are you planning?",
    subtitle: "This platform plans software products only — it will say so honestly if it's not the right tool.",
    options: [
      { value: "software_product", label: "A software product", hint: "App, platform, SaaS, API, internal tool…" },
      { value: "non_product", label: "Something else", hint: "Marketing campaign, office project, client services…" },
    ],
  },
  {
    key: "executionTool",
    title: "Where does your team track execution?",
    subtitle: "The plan syncs into your execution tool — the platform stays the system of record.",
    options: [
      { value: "jira", label: "Jira", hint: "Sync available in this prototype (demo mode)" },
      { value: "azure_devops", label: "Azure DevOps", hint: "Planned — v1.2" },
      { value: "aha", label: "Aha!", hint: "Planned — v1.1" },
      { value: "other", label: "Something else" },
      { value: "none", label: "Nothing yet" },
    ],
  },
  {
    key: "statedMethodology",
    title: "How does your team plan and deliver?",
    subtitle: "The platform's flagship model is hybrid waterfall: waterfall sequencing for planning, Agile cadence for execution.",
    options: [
      { value: "hybrid", label: "Hybrid — structured planning, Agile delivery" },
      { value: "agile_scrum", label: "Agile / Scrum" },
      { value: "waterfall", label: "Waterfall" },
      { value: "kanban", label: "Kanban" },
      { value: "not_sure", label: "Not sure", hint: "Hybrid waterfall will be applied by default" },
    ],
  },
];

export default function QualifyingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nonProduct = answers.productType === "non_product";
  const atSummary = step >= QUESTIONS.length;
  const question = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];

  const pick = (value: string) => {
    setAnswers((a) => ({ ...a, [question.key]: value }));
    setError(null);
    setStep((s) => s + 1);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await apiFetch("/api/qualifying", { method: "POST", body: answers });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/home");
    router.refresh();
  };

  // FR-02: respectful redirection for non-product work.
  if (nonProduct && step > 3) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <h2 className="text-xl font-semibold text-amber-900">
          This probably isn&apos;t the right tool for that
        </h2>
        <p className="mt-3 text-amber-800">
          The Guided Product Planning Platform plans <strong>software products</strong> only.
          Marketing campaigns, office projects, and client services deserve a tool built for
          them — a work-management or campaign-planning product will serve you far better.
        </p>
        <p className="mt-3 text-amber-800">
          If you meant to plan a software product after all, go back and change your answer.
        </p>
        <button
          onClick={() => setStep(3)}
          className="mt-6 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          ← Back — I&apos;m planning a software product
        </button>
      </div>
    );
  }

  if (atSummary) {
    const labelFor = (key: string) =>
      QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === answers[key])?.label ??
      "—";
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold">Your setup</h2>
        <p className="mt-1 text-sm text-neutral-500">
          The intake ahead adapts to this profile. Same eight questions for everyone — the
          guidance calibrates to you.
        </p>
        <dl className="mt-5 space-y-3 text-sm">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="flex items-start justify-between gap-4">
              <dt className="text-neutral-500">{q.title}</dt>
              <dd className="text-right font-medium">{labelFor(q.key)}</dd>
            </div>
          ))}
          <div className="flex items-start justify-between gap-4 border-t border-neutral-100 pt-3">
            <dt className="text-neutral-500">Planning model applied</dt>
            <dd className="text-right font-medium text-indigo-700">Hybrid waterfall</dd>
          </div>
        </dl>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(0)}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Start over
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Looks right — continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-600">
        Question {step + 1} of {QUESTIONS.length}
      </p>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all"
          style={{ width: `${(step / QUESTIONS.length) * 100}%` }}
        />
      </div>
      <h2 className="text-2xl font-semibold">{question.title}</h2>
      <p className="mt-2 text-neutral-500">{question.subtitle}</p>
      <div className="mt-6 space-y-2">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => pick(opt.value)}
            className={`block w-full rounded-xl border px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50 ${
              answers[question.key] === opt.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-neutral-200 bg-white"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
            {opt.hint && <span className="mt-0.5 block text-sm text-neutral-500">{opt.hint}</span>}
          </button>
        ))}
      </div>
      {step > 0 && (
        <button
          onClick={() => setStep((s) => s - 1)}
          className="mt-6 text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
