"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/clientApi";
import { LEGACY_QUALIFYING_PROFILE_DEFAULTS } from "@/lib/questionnaire/legacyQualifyingDefaults";
import { depthFromExperience, isSimplifiedIntakeExperience } from "@/lib/questionnaire/roleGuidance";
import { readOnboardingState, writeOnboardingState } from "@/lib/onboarding/tempStateClient";
import { WORKING_ROLE_META } from "@/lib/onboarding/roleOptions";
import { EXPERIENCE_LEVEL_OPTIONS, type SimplifiedExperienceLevel } from "@/lib/onboarding/experienceOptions";
import type { WorkingRole } from "@/lib/onboarding/types";
import { ButtonLoader, GenerationProgress } from "@/components/ui/loading";
import AlreadyKnownFromProject from "./AlreadyKnownFromProject";
import SectionProgress from "./SectionProgress";
import GuidanceBanner from "./GuidanceBanner";
import { ChoiceCard } from "./Choice";
import ProductDirectionFields, { type ProductDirectionValues } from "./ProductDirectionFields";
import SimplifiedIntakeWizard from "./SimplifiedIntakeWizard";

// Directive item 18: a meaningful checklist, not a generic spinner, honest
// about which steps really happen — the qualifying-profile save only runs
// when the user has no profile yet (see submit()), so a profile-holding
// user's list can't include a step for a call that won't run. See
// GenerationProgress's own contract: every step shown as done must have
// really completed.
const STEPS_NEW_PROFILE = [
  "Saving your setup",
  "Creating your initiative",
  "Saving your answers",
  "Preparing initiative workspace",
];
const STEPS_EXISTING_PROFILE = ["Creating your initiative", "Saving your answers", "Preparing initiative workspace"];

// Guided-activation restructure (reference doc §13): full 6-option Working
// Role list, matching WorkingRoleSelector — this component's own role
// question is now only reachable via a direct deep-link to /initiatives/new
// before onboarding finishes (the normal path always arrives with hasProfile
// true and a role already set from /onboarding/role), but it must still
// offer the same real, non-rejecting choices when it is.
const ROLE_ORDER: WorkingRole[] = ["product_owner", "product_management", "project_manager"];

type StartingPoint = "fresh" | "import" | "use_project_context";

export interface ExistingProjectSummary {
  id: string;
  name: string;
  /** Whether this Project already has real shared context to reuse (budget,
   * rate, or target date already set, or a prior initiative) — directive §9:
   * "use existing project context" only makes sense once there's context. */
  hasContext: boolean;
  budget: number | null;
  averageHourlyRate: number | null;
  targetLaunchDate: string | null;
}

export default function ProductDirectionBootstrap(props: {
  hasProfile: boolean;
  workingRole: WorkingRole | null;
  /** Set when reached via Project Home's "+ New initiative" (directive §8/§9)
   * — attaches the new Initiative to this Project instead of auto-creating a
   * fresh one, and offers "Use existing project context" as a starting point. */
  project?: ExistingProjectSummary | null;
}) {
  const router = useRouter();
  const [roleAnswer, setRoleAnswer] = useState<WorkingRole | null>(
    props.hasProfile ? (props.workingRole ?? "product_management") : props.workingRole,
  );
  const passedRoleGate = roleAnswer !== null;
  const [experienceLevel, setExperienceLevel] = useState("some_experience");
  const [values, setValues] = useState<ProductDirectionValues>({
    name: "",
    problemStatement: "",
    targetCustomer: "",
  });
  // Guided-activation restructure (reference doc §6 "Starting point"):
  // "Start fresh" is today's existing behavior unchanged. "Import existing
  // work" skips the core-idea fields (an imported document fills them) and
  // drops straight into /intake, where ImportIntakePanel already lives
  // inside the full PlanningQuestionnaire — no new import surface needed,
  // just skipping fields that would otherwise be asked and thrown away.
  // "Connect existing work" has no real integration-import path yet
  // (Integrations Hub is demo-only), so it's honestly marked unavailable
  // rather than pretending to do something — reference doc §11.
  const [startingPoint, setStartingPoint] = useState<StartingPoint>(
    props.project?.hasContext ? "use_project_context" : "fresh",
  );
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const verbose = depthFromExperience(props.hasProfile ? undefined : experienceLevel);
  const showSimplifiedWizard = !props.hasProfile && isSimplifiedIntakeExperience(experienceLevel);
  const creationSteps = props.hasProfile ? STEPS_EXISTING_PROFILE : STEPS_NEW_PROFILE;
  // Offsets the two steps that only run when there's no profile yet, so the
  // same setStep() calls below work for either list.
  const stepOffset = props.hasProfile ? 0 : 1;

  const pickRole = (value: WorkingRole) => {
    setRoleAnswer(value);
    writeOnboardingState({ workingRole: value });
    void apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: value } });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStep(0);
    setError(null);

    if (!props.hasProfile) {
      const workspaceType = readOnboardingState().workspaceType;
      const profileRes = await apiFetch("/api/qualifying", {
        method: "POST",
        body: {
          ...LEGACY_QUALIFYING_PROFILE_DEFAULTS,
          teamComposition: workspaceType === "solo" ? "solo" : "small_team",
          productType: "software_product",
          experienceLevel,
        },
      });
      if (!profileRes.ok) {
        setSubmitting(false);
        setError(profileRes.error ?? "Could not save your setup.");
        return;
      }
    }

    setStep(stepOffset);
    const initRes = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: {
        name: values.name,
        ...(props.project ? { projectId: props.project.id } : {}),
        intakeMethod: startingPoint === "fresh" ? "guided" : startingPoint,
      },
    });
    if (!initRes.ok || !initRes.data) {
      setSubmitting(false);
      setError(initRes.error ?? "Could not create the initiative.");
      return;
    }

    const { initiativeId } = initRes.data;
    setStep(stepOffset + 1);
    await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: { problemStatement: values.problemStatement, targetCustomer: values.targetCustomer },
    });

    // Deliberately not resetting `submitting` on the success path — it stays
    // true (showing the final step) through the real interval until the
    // route change unmounts this component, matching
    // SimplifiedIntakeWizard.tsx's own precedent for the same
    // GenerationProgress component.
    setStep(stepOffset + 2);
    router.push(`/initiatives/${initiativeId}/intake`);
    router.refresh();
  };

  if (submitting) {
    return (
      <div>
        <SectionProgress current={0} />
        <GenerationProgress title="Creating your initiative" steps={creationSteps} currentStep={step} />
      </div>
    );
  }

  return (
    <div>
      <SectionProgress current={0} />

      <form onSubmit={submit} className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-md md:p-10">
        {!props.hasProfile && !passedRoleGate && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Question 1</p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
              What&apos;s your role?
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
              This shapes how guidance is framed throughout the process — not what&apos;s asked or
              how your plan is built.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {ROLE_ORDER.map((value) => (
                <ChoiceCard
                  key={value}
                  selected={false}
                  onClick={() => pickRole(value)}
                  label={WORKING_ROLE_META[value].label}
                  hint={WORKING_ROLE_META[value].description}
                />
              ))}
            </div>
          </div>
        )}

        {(props.hasProfile || passedRoleGate) && (
          <>
            {!props.hasProfile && (
              <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Question 2</p>
                <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
                  How much product planning experience do you have?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  Calibrates how much explanation you see throughout — not what&apos;s asked.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {EXPERIENCE_LEVEL_OPTIONS.map((o) => (
                    <ChoiceCard
                      key={o.value}
                      selected={experienceLevel === o.value}
                      onClick={() => setExperienceLevel(o.value)}
                      label={o.label}
                      hint={o.hint}
                    />
                  ))}
                </div>
              </div>
            )}

            {!showSimplifiedWizard && (
              <>
                <div className="border-t border-neutral-100 pt-7 first:border-0 first:pt-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Starting point
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <ChoiceCard
                      selected={startingPoint === "fresh"}
                      onClick={() => setStartingPoint("fresh")}
                      label="Guide me through it"
                      hint="Answer a few questions to build the plan from scratch."
                    />
                    <ChoiceCard
                      selected={startingPoint === "import"}
                      onClick={() => setStartingPoint("import")}
                      label="Import my existing work"
                      hint="Pull details from a document instead of typing them here."
                    />
                    {props.project ? (
                      <ChoiceCard
                        selected={startingPoint === "use_project_context"}
                        onClick={() => setStartingPoint("use_project_context")}
                        label="Use project context"
                        hint={`Reuse ${props.project.name}'s budget, rate, and target date — just add this initiative's details.`}
                      />
                    ) : (
                      <ChoiceCard
                        selected={false}
                        onClick={() => {}}
                        className="cursor-not-allowed opacity-50"
                        label="Connect existing work"
                        hint="Not yet available — no live integration import exists yet."
                      />
                    )}
                  </div>
                  {props.project && startingPoint === "use_project_context" && (
                    <AlreadyKnownFromProject project={props.project} />
                  )}
                </div>

                <div className="mt-7 border-t border-neutral-100 pt-7">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {props.hasProfile ? "New initiative" : "Question 3"}
                  </p>
                  <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
                    What&apos;s the core idea?
                  </h2>
                  <GuidanceBanner section="productDirection" workingRole={props.workingRole} />
                  {startingPoint === "import" && (
                    <p className="mt-2 rounded-lg bg-accent/[0.06] px-3 py-2 text-xs text-text-secondary">
                      You can leave the problem and customer fields blank — you&apos;ll pull those
                      details from your imported document on the next step instead.
                    </p>
                  )}
                  <ProductDirectionFields
                    values={values}
                    onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
                    verbose={verbose}
                  />
                </div>

                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                <div className="mt-8 flex justify-end">
                  <ButtonLoader
                    type="submit"
                    loading={false}
                    disabled={values.name.trim().length < 3}
                    className="px-6 py-3"
                  >
                    Create Initiative
                  </ButtonLoader>
                </div>
              </>
            )}
          </>
        )}
      </form>

      {showSimplifiedWizard && (
        <div className="mt-6">
          <SimplifiedIntakeWizard
            hasProfile={false}
            workingRole={roleAnswer as WorkingRole}
            experienceLevel={experienceLevel as SimplifiedExperienceLevel}
          />
        </div>
      )}
    </div>
  );
}
