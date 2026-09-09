"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { writeOnboardingState } from "@/lib/onboarding/tempStateClient";
import type { WorkingRole } from "@/lib/onboarding/types";
import Button from "@/components/ui/Button";
import { ChoiceCard } from "@/components/questionnaire/Choice";

const ROLE_OPTIONS: { value: WorkingRole; label: string; hint: string }[] = [
  { value: "product_owner", label: "Product Owner", hint: "Own the backlog and translate strategy into shippable work." },
  { value: "product_management", label: "Product Management", hint: "Own the roadmap and product outcomes." },
  { value: "project_manager", label: "Project Manager", hint: "Keep delivery on schedule and on budget." },
];

const EXPERIENCE_OPTIONS = [
  { value: "first_time", label: "This is my first formal plan" },
  { value: "some_experience", label: "Some experience", hint: "I've put plans together before, informally or with light process." },
  { value: "experienced", label: "Experienced", hint: "I plan products regularly and know the terrain." },
  { value: "expert", label: "Expert — I could teach this" },
];

/** Same role + experience questions as Step 1 of the initiative-creation
 * questionnaire (ProductDirectionBootstrap), but scoped to qualifying only —
 * this page never creates an initiative, it just establishes the profile
 * and returns to /home, matching the old QualifyingWizard's behavior.
 *
 * The role question is skipped when `workingRole` already came out of V2
 * onboarding (`/onboarding/role`) — every user who reaches /welcome has
 * already answered it once, so asking again here would just be a duplicate
 * of that question. Mirrors the same known-role skip ProductDirectionBootstrap
 * already does for the initiative-creation flow. */
export default function WelcomeQualifying(props: { workingRole: WorkingRole | null }) {
  const router = useRouter();
  const roleKnown = props.workingRole != null;
  const [step, setStep] = useState<0 | 1>(roleKnown ? 1 : 0);
  const [roleAnswer, setRoleAnswer] = useState<WorkingRole | "something_else" | null>(props.workingRole);
  const [experienceLevel, setExperienceLevel] = useState("some_experience");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickRole = (value: WorkingRole) => {
    setRoleAnswer(value);
    writeOnboardingState({ workingRole: value });
    void apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: value } });
    setStep(1);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await apiFetch("/api/qualifying", {
      method: "POST",
      body: { ...LEGACY_QUALIFYING_PROFILE_DEFAULTS, productType: "software_product", experienceLevel },
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error ?? "Something went wrong.");
      return;
    }
    router.push("/home");
    router.refresh();
  };

  const totalQuestions = roleKnown ? 1 : 2;
  const currentQuestionNumber = roleKnown ? 1 : step + 1;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-9">
        <div className="mb-2.5 flex items-baseline justify-between gap-4">
          <p className="text-xs font-medium text-text-muted">
            <span className="font-semibold text-text-primary">
              Question {currentQuestionNumber} of {totalQuestions}
            </span>
          </p>
          <p className="text-xs font-semibold tabular-nums text-accent">
            {Math.round((currentQuestionNumber / totalQuestions) * 100)}%
          </p>
        </div>
        <div className="flex gap-1.5">
          {!roleKnown && <div className="h-1.5 flex-1 rounded-full bg-accent" />}
          <div className={`h-1.5 flex-1 rounded-full ${step === 1 ? "bg-accent" : "bg-neutral-200"}`} />
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
        {step === 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Question 1</p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">What&apos;s your role?</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
              This shapes how guidance is framed throughout the process — not what&apos;s asked or
              how your plan is built.
            </p>
            {roleAnswer === "something_else" ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <h3 className="font-semibold text-amber-900">This probably isn&apos;t the right tool for that</h3>
                <p className="mt-3 text-sm leading-relaxed text-amber-800">
                  The Guided Product Planning Platform is built for people driving a software
                  product roadmap — development, product management, or project management. If
                  none of those fit, a general work-management tool will serve you better.
                </p>
                <Button type="button" variant="secondary" onClick={() => setRoleAnswer(null)} className="mt-4">
                  ← Go back — one of those is closer to my role
                </Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {ROLE_OPTIONS.map((o) => (
                  <ChoiceCard key={o.value} selected={false} onClick={() => pickRole(o.value)} label={o.label} hint={o.hint} />
                ))}
                <ChoiceCard
                  selected={false}
                  onClick={() => setRoleAnswer("something_else")}
                  label="Something else"
                  hint="This tool is built for people driving a software product roadmap."
                />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Question {currentQuestionNumber}
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
              How much product planning experience do you have?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Calibrates how much explanation you see throughout — not what&apos;s asked.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {EXPERIENCE_OPTIONS.map((o) => (
                <ChoiceCard
                  key={o.value}
                  selected={experienceLevel === o.value}
                  onClick={() => setExperienceLevel(o.value)}
                  label={o.label}
                  hint={o.hint}
                />
              ))}
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <div className="mt-8 flex items-center justify-between">
              {roleKnown ? (
                <div />
              ) : (
                <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                  ← Back
                </Button>
              )}
              <Button type="button" onClick={submit} disabled={submitting} className="px-6 py-3">
                {submitting ? "Saving…" : "Continue →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
