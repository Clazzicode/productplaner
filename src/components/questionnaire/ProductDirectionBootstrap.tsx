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
import Button from "@/components/ui/Button";
import SectionProgress from "./SectionProgress";
import GuidanceBanner from "./GuidanceBanner";
import { ChoiceCard } from "./Choice";
import ProductDirectionFields, { type ProductDirectionValues } from "./ProductDirectionFields";
import SimplifiedIntakeWizard from "./SimplifiedIntakeWizard";

const ROLE_ORDER: WorkingRole[] = ["product_owner", "product_management", "project_manager"];

export default function ProductDirectionBootstrap(props: { hasProfile: boolean; workingRole: WorkingRole | null }) {
  const router = useRouter();
  const [roleAnswer, setRoleAnswer] = useState<WorkingRole | "something_else" | null>(
    props.hasProfile ? (props.workingRole ?? "product_management") : props.workingRole,
  );
  const passedRoleGate = roleAnswer !== null && roleAnswer !== "something_else";
  const [experienceLevel, setExperienceLevel] = useState("some_experience");
  const [values, setValues] = useState<ProductDirectionValues>({
    name: "",
    problemStatement: "",
    targetCustomer: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verbose = depthFromExperience(props.hasProfile ? undefined : experienceLevel);
  const showSimplifiedWizard = !props.hasProfile && isSimplifiedIntakeExperience(experienceLevel);

  const pickRole = (value: WorkingRole) => {
    setRoleAnswer(value);
    writeOnboardingState({ workingRole: value });
    void apiFetch("/api/account/working-role", { method: "PATCH", body: { workingRole: value } });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
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

    const initRes = await apiFetch<{ initiativeId: string }>("/api/initiatives", {
      method: "POST",
      body: { name: values.name },
    });
    if (!initRes.ok || !initRes.data) {
      setSubmitting(false);
      setError(initRes.error ?? "Could not create the initiative.");
      return;
    }

    const { initiativeId } = initRes.data;
    await apiFetch(`/api/initiatives/${initiativeId}/intake`, {
      method: "PATCH",
      body: { problemStatement: values.problemStatement, targetCustomer: values.targetCustomer },
    });

    setSubmitting(false);
    router.push(`/initiatives/${initiativeId}/intake`);
    router.refresh();
  };

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
                {ROLE_ORDER.map((value) => (
                  <ChoiceCard
                    key={value}
                    selected={false}
                    onClick={() => pickRole(value)}
                    label={WORKING_ROLE_META[value].label}
                    hint={WORKING_ROLE_META[value].description}
                  />
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
                    {props.hasProfile ? "New initiative" : "Question 3"}
                  </p>
                  <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">
                    What&apos;s the core idea?
                  </h2>
                  <GuidanceBanner section="productDirection" workingRole={props.workingRole} />
                  <ProductDirectionFields
                    values={values}
                    onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
                    verbose={verbose}
                  />
                </div>

                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                <div className="mt-8 flex justify-end">
                  <Button type="submit" disabled={submitting || values.name.trim().length < 3} className="px-6 py-3">
                    {submitting ? "Creating…" : "Continue →"}
                  </Button>
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
